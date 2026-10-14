import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {chromium} from '@playwright/test';
import {Store} from '../../server/store.js';
import {createProductionServer} from '../../server/production.js';
import {initResources,handleResources,getReferenceContext} from '../../server/resources.js';
import {initContinuity,handleContinuity,getLearningContext,recordAnswerSources} from '../../server/continuity.js';

let browser,server,store,dir,baseURL;
const credentials={username:'browser-admin',password:randomBytes(24).toString('hex')};
const artifacts=path.resolve('test-results/frontend');
const failures=new Set();
const ai={configured:true,capabilities:{vision:false},generate:async input=>{
  const text=JSON.stringify(input.messages);
  if(input.purpose==='memory-candidates'){const supplied=JSON.parse(input.messages[0].content);return JSON.stringify({candidates:[{title:'迭代器删除',content:'我容易忘记 erase 后应使用返回的迭代器，仍需练习。',status:'active',sourceIds:supplied.sourceIds,targetMemoryId:supplied.existingMemories[0]?.id||null}]});}
  if(input.purpose==='state-preview')return '迭代器删除仍需练习；明天有课堂测验。';
  if(input.purpose==='action-advice')return '先用 20 分钟练习迭代器删除，再检查课堂测验范围。';
  if(text.includes('fail-once')&&!failures.has(text)){failures.add(text);throw new Error('Injected test-only provider outage');}
  return '这是由测试适配器生成的回答。\n\n```cpp\nauto it = values.erase(it);\n```\n\n公式：$x^2 + y^2 = 1$。另一个式子：\\(a+b\\)。\n\n\\[c=d\\]\n\n<img src=x onerror="window.__unsafe=true"><script>window.__unsafe=true</script> [安全链接](https://example.org)';
}};
before(async()=>{
  dir=await mkdtemp(path.join(tmpdir(),'yixue-browser-'));store=new Store(path.join(dir,'test.sqlite'));
  const config={uploadsDir:path.join(dir,'uploads'),staticRoot:path.resolve('dist'),adminUsername:credentials.username,adminPassword:credentials.password,secureCookies:false};
  await initResources(store,config);initContinuity(store,config);
  server=await createProductionServer(store,{config,ai,handlers:[handleResources,handleContinuity],contextHooks:{resourceContext:getReferenceContext,learningContext:getLearningContext,recordAnswerSources}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:process.env.YIXUE_BROWSER_CHANNEL||'msedge',headless:true});await mkdir(artifacts,{recursive:true});
});
after(async()=>{await browser?.close();await server?.drain();if(server)await new Promise(resolve=>server.close(resolve));store?.close();if(dir)await rm(dir,{recursive:true,force:true});});
async function pageFor(t,width=1366){const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(async()=>{await page.screenshot({path:path.join(artifacts,`last-${width}-${t.name.slice(0,15).replace(/\W/g,'-')}.png`),fullPage:true});await context.close();assert.deepEqual(errors,[]);});await page.goto(baseURL);await page.locator('[data-login] [name=username]').fill(credentials.username);await page.locator('[data-login] [name=password]').fill(credentials.password);await page.locator('[data-login] button').click();await page.locator('[data-app]').waitFor({state:'visible'});return page;}
async function subjectAndChat(page,name){await page.locator('[data-view-link=subjects]').click();await page.locator('[data-add-subject]').click();await page.locator('dialog [name=name]').fill(name);await page.getByRole('button',{name:'创建学科',exact:true}).click();await page.locator('[data-current-subject]').waitFor({state:'visible'});await page.locator('[data-nav-toggle]').click();await page.locator('[data-new-conversation]').click();await page.locator('[data-message-input]').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-message-input]').disabled);}
async function send(page,content){await page.locator('[data-message-input]').fill(content);await page.locator('[data-send-message]').click();await page.waitForFunction(()=>document.querySelectorAll('.r1-assistant-message').length>0&&document.querySelector('[data-run-status]').textContent==='');}
async function mutation(page,endpoint,method,body){return page.evaluate(async({endpoint,method,body})=>{const me=await(await fetch('/api/auth/me')).json();const response=await fetch(endpoint,{method,headers:{'content-type':'application/json','X-CSRF-Token':me.csrfToken},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:response.status===204?null:await response.json()};},{endpoint,method,body});}

test('production home is schedule-first with persistent independent planner',async t=>{
 const page=await pageFor(t);await page.locator('.calendar.week').waitFor();await page.getByRole('button',{name:'日',exact:true}).click();assert.equal(await page.locator('.calendar.day').count(),1);await page.getByRole('button',{name:'打开规划助手'}).click();await page.getByRole('button',{name:'＋ 新对话'}).click();await page.getByRole('textbox',{name:'规划输入'}).fill('我只有20分钟');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('我只有20分钟',{exact:true}).last().waitFor();await page.reload();await page.getByText('我只有20分钟',{exact:true}).last().waitFor();assert.equal(store.get('SELECT COUNT(*) n FROM subjects').n,0);
});
test('production review is editable downloadable documents and files still upload',async t=>{
 const page=await pageFor(t);await subjectAndChat(page,'文档学科');const subject=store.get("SELECT id FROM subjects WHERE name='文档学科'");const at=new Date().toISOString();store.run("INSERT INTO learning_memories VALUES (?,?,?,?,'active','',1,?,?)",'doc-test',subject.id,'回顾文档','原文',at,at);await page.locator('[data-subject-tab=review]').click();await page.getByRole('button',{name:'回顾文档',exact:true}).click();await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('textbox',{name:'内容',exact:true}).fill('编辑后的文档');await page.getByRole('button',{name:'保存文档',exact:true}).click();await page.getByText('编辑后的文档',{exact:true}).waitFor();const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载',exact:true}).click();assert.match((await download).suggestedFilename(),/md$/);await page.locator('[data-subject-tab=files]').click();await page.getByRole('button',{name:'上传资料',exact:true}).click();await page.locator('dialog input[type=file]').setInputFiles({name:'真实文件.txt',mimeType:'text/plain',buffer:Buffer.from('文件内容')});await page.getByRole('button',{name:'上传私人资料',exact:true}).click();await page.getByRole('button',{name:'真实文件.txt',exact:true}).waitFor();
});
