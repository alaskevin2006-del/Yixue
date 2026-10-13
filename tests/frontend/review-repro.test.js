import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {Store} from '../../server/store.js';
import {createProductionServer} from '../../server/production.js';
import {initResources,handleResources,getReferenceContext} from '../../server/resources.js';
import {initContinuity,handleContinuity,getLearningContext,recordAnswerSources} from '../../server/continuity.js';

let browser,server,store,dir,baseURL,resolvePreview;
const credentials={username:'review-admin',password:randomUUID()};
const ai={configured:true,generate:async input=>input.purpose==='state-preview'?new Promise(resolve=>{resolvePreview=resolve;}):'真实测试边界回答'};
before(async()=>{
  dir=await mkdtemp(path.join(tmpdir(),'yixue-frontend-review-'));store=new Store(path.join(dir,'db.sqlite'));
  const config={uploadsDir:path.join(dir,'uploads'),staticRoot:path.resolve('dist'),adminUsername:credentials.username,adminPassword:credentials.password};
  initResources(store,config);initContinuity(store);
  server=await createProductionServer(store,{config,ai,handlers:[handleResources,handleContinuity],contextHooks:{resourceContext:getReferenceContext,learningContext:getLearningContext,recordAnswerSources}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:process.env.YIXUE_BROWSER_CHANNEL||'msedge',headless:true});
});
after(async()=>{resolvePreview?.('未采用的旧建议');await browser?.close();await server?.drain();if(server)await new Promise(resolve=>server.close(resolve));store?.close();if(dir)await rm(dir,{recursive:true,force:true});});
function seed(name){const s=randomUUID(),c=randomUUID(),owner=store.get('SELECT id FROM users WHERE username=?',credentials.username).id;store.run('INSERT INTO subjects (id,owner_user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)',s,owner,name,'now','now');store.run('INSERT INTO conversations (id,subject_space_id,title,created_at,updated_at) VALUES (?,?,?,?,?)',c,s,'审查对话','now','now');return {s,c};}
async function pageFor(t,subject){const context=await browser.newContext({viewport:{width:1366,height:900}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(`${baseURL}/#/subjects/${subject.s}/${subject.c}`);await page.locator('[data-login] [name=username]').fill(credentials.username);await page.locator('[data-login] [name=password]').fill(credentials.password);await page.locator('[data-login] button').click();await page.waitForFunction(()=>!document.querySelector('[data-message-input]').disabled);return page;}

test('composer preserves original leading code indentation and trailing newline',async t=>{
  const subject=seed('原文保留审查');const page=await pageFor(t,subject);const original='    if ready:\n        execute()\n';
  await page.locator('[data-message-input]').fill(original);await page.locator('[data-send-message]').click();await page.locator('[data-messages] .r1-user-message').waitFor();
  assert.equal(store.get("SELECT content FROM messages WHERE conversation_id=? AND role='user'",subject.c).content,original);
});

test('late AI state preview does not replace the editor after changing subjects',async t=>{
  const a=seed('学科A审查'),b=seed('学科B审查');const page=await pageFor(t,a);resolvePreview=null;
  await page.locator('[data-state-current]').click();await page.locator('[data-state-editor] textarea[name=input]').fill('学科A的新情况');await page.getByRole('button',{name:'请 AI 整理',exact:true}).click();
  while(!resolvePreview)await new Promise(resolve=>setTimeout(resolve,10));
  await page.locator('[data-state-subjects]').getByRole('button',{name:'学科B审查',exact:true}).click();await page.locator('[data-state-editor] h3').filter({hasText:'学科B审查'}).waitFor();
  const received=page.waitForResponse(response=>response.url().includes(`/api/subjects/${a.s}/state/preview`));resolvePreview('学科A的旧异步建议');await received;await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-state-editor] h3').textContent(),'学科B审查');
  assert.equal(store.get('SELECT content FROM subject_states WHERE subject_space_id=?',b.s),null);
});

test('an old bootstrap response cannot replace the new account CSRF token',async t=>{
  const page=await pageFor(t,seed('账户切换审查'));const next={username:'second-review-user',password:randomUUID()};
  await page.evaluate(async next=>{const me=await(await fetch('/api/auth/me')).json();const response=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken},body:JSON.stringify(next)});if(response.status!==201)throw Error('Could not create second account');},next);
  let release,received;const ready=new Promise(resolve=>received=resolve),gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/auth/me',async route=>{const response=await route.fetch();received();await gate;await route.fulfill({response});},{times:1});
  t.after(()=>release());await page.reload();await ready;
  await page.locator('[data-login] [name=username]').fill(next.username);await page.locator('[data-login] [name=password]').fill(next.password);await page.locator('[data-login] button').click();
  await page.locator(`[data-account][title="${next.username} · 账户"]`).waitFor();release();await page.waitForTimeout(150);
  const result=await page.evaluate(async()=>{const {api}=await import('/client/api.js');try{await api('/api/subjects',{method:'POST',body:{name:'切换后真实保存'}});return {saved:true};}catch(error){return {saved:false,code:error.code};}});
  assert.deepEqual(result,{saved:true});
});

test('state version conflict preserves the unsaved draft and displays the server error',async t=>{
  const subject=seed('保存冲突审查'),page=await pageFor(t,subject);
  await page.locator('[data-state-current]').click();await page.getByRole('button',{name:'直接编辑',exact:true}).click();
  const draft='用户本次尚未保存的完整现状';await page.locator('[data-state-editor] textarea').fill(draft);
  await page.evaluate(async subject=>{const {api}=await import('/client/api.js');await api(`/api/subjects/${subject.s}/state`,{method:'PUT',body:{content:'另一个页面已保存的新版本',version:0}});},subject);
  await page.getByRole('button',{name:'保存现状',exact:true}).click();await page.locator('[data-state-editor] .form-error').filter({hasText:'现状已变化'}).waitFor();
  assert.equal(await page.locator('[data-state-editor] textarea').inputValue(),draft);
  assert.equal(store.get('SELECT content FROM subject_states WHERE subject_space_id=?',subject.s).content,'另一个页面已保存的新版本');
});
