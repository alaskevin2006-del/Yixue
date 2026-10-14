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

test('late document fetch cannot replace another subject review',async t=>{
 const a=seed('学科A审查'),b=seed('学科B审查');const at=new Date().toISOString();store.run("INSERT INTO learning_memories VALUES (?,?,?,?,'active','',1,?,?)",'race-doc',a.s,'A文档','A内容',at,at);const page=await pageFor(t,a);
 await page.locator('[data-subject-tab=review]').click();let release,received;const ready=new Promise(r=>received=r),gate=new Promise(r=>release=r);t.after(()=>release?.());await page.route('**/api/memories/race-doc',async route=>{const response=await route.fetch();received();await gate;await route.fulfill({response});},{times:1});await page.getByRole('button',{name:'A文档',exact:true}).click();await ready;await page.goto(`${baseURL}/#/subjects/${b.s}/${b.c}`);await page.locator('[data-current-subject]').filter({hasText:'学科B审查'}).waitFor();await page.locator('[data-subject-tab=review]').click();release();await page.waitForTimeout(150);assert.doesNotMatch(await page.locator('[data-review-panel]').textContent(),/A内容/);
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

test('planner text conflict preserves draft and displays the server error',async t=>{
 const page=await pageFor(t,seed('保存冲突审查'));await page.goto(`${baseURL}/#/planner`);await page.getByRole('button',{name:'学科状态',exact:true}).click();await page.getByRole('button',{name:'＋ 新建文本'}).click();await page.getByRole('textbox',{name:'学科名称'}).fill('冲突文本');await page.getByRole('textbox',{name:'状态文本'}).fill('原文');await page.getByRole('button',{name:'保存文本'}).click();await page.getByRole('button',{name:'冲突文本',exact:true}).click();const draft='用户尚未保存的完整文本';await page.getByRole('textbox',{name:'状态文本'}).fill(draft);await page.evaluate(async()=>{const {api}=await import('/client/api.js');const {records}=await api('/api/planner');const r=records.find(r=>r.title==='冲突文本');await api('/api/planner/records/'+r.id,{method:'PATCH',body:{version:r.version,title:r.title,content:'另一个页面的新版本'}});});await page.getByRole('button',{name:'保存文本'}).click();await page.locator('dialog .form-error').filter({hasText:/变化|更新|刷新/}).waitFor();assert.equal(await page.getByRole('textbox',{name:'状态文本'}).inputValue(),draft);
});

test('logout clears rendered planner before a different account loads',async t=>{
 const page=await pageFor(t,seed('规划账号清理'));await page.goto(`${baseURL}/#/planner`);await page.getByRole('button',{name:'＋ 新对话'}).click();await page.getByRole('textbox',{name:'规划输入'}).fill('属于当前账号的规划');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('属于当前账号的规划',{exact:true}).last().waitFor();await page.locator('[data-account]').click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.locator('[data-auth]').waitFor();assert.equal(await page.locator('#planner-view').textContent(),'');assert.equal(await page.locator('#home-view').textContent(),'');
});

test('late document save cannot show another subject document',async t=>{
 const a=seed('保存A'),b=seed('保存B');const at=new Date().toISOString();store.run("INSERT INTO learning_memories VALUES (?,?,?,?,'active','',1,?,?)",'save-race-doc',a.s,'保存A文档','原文',at,at);const page=await pageFor(t,a);await page.locator('[data-subject-tab=review]').click();await page.getByRole('button',{name:'保存A文档',exact:true}).click();await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('textbox',{name:'内容',exact:true}).fill('A已保存的文本');let release,received;const ready=new Promise(r=>received=r),gate=new Promise(r=>release=r);t.after(()=>release?.());await page.route('**/api/memories/save-race-doc',async route=>{if(route.request().method()!=='PATCH'){await route.continue();return;}const response=await route.fetch();received();await gate;await route.fulfill({response});});await page.getByRole('button',{name:'保存文档'}).click();await ready;await page.evaluate(hash=>location.hash=hash,`/subjects/${b.s}/${b.c}`);await page.locator('[data-current-subject]').filter({hasText:'保存B'}).waitFor();await page.locator('[data-subject-tab=review]').click();release();await page.waitForTimeout(200);assert.doesNotMatch(await page.locator('[data-review-panel]').textContent(),/A已保存|保存A文档/);assert.equal(store.get('SELECT content FROM learning_memories WHERE id=?','save-race-doc').content,'A已保存的文本');
});
