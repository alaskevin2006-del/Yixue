import {test,expect,request} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const baseURL='http://127.0.0.1:3003',password='connected-test-password';
async function login(client,username,pw=password){const r=await client.post('/api/auth/login',{data:{username,password:pw}});expect(r.ok()).toBeTruthy();return r.json();}
async function call(client,token,path,data,method='POST'){const r=await client.fetch(path,{method,headers:{'x-csrf-token':token},data});expect(r.ok(),await r.text()).toBeTruthy();return r.status()===204?null:r.json();}
async function setup(page){const admin=await request.newContext({baseURL});const a=await login(admin,'prototype-test','local-test-only-password');const name='u'+randomUUID().slice(0,12);const user=(await call(admin,a.csrfToken,'/api/admin/users',{username:name,password})).user;const u=await login(page.request,name);const subject=(await call(page.request,u.csrfToken,'/api/subjects',{name:'C++验收'})).subject;return {admin,a,u,user,name,subject};}

test('login failure, admin redirect, role barrier and logout',async({page})=>{
 await page.goto('/');await page.getByLabel('用户名',{exact:true}).fill('invalid');await page.getByLabel('密码',{exact:true}).fill('not-correct');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('#login-error')).toContainText('用户名或密码错误');
 const f=await setup(page);await page.goto('/admin/');await expect(page.locator('#app')).toContainText('管理员');expect((await page.request.get('/api/admin/users')).status()).toBe(403);
 await page.goto('/');await expect(page.getByRole('heading',{name:'行动安排'})).toBeVisible();await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.locator('#login-screen')).toBeVisible();expect((await page.request.get('/api/subjects')).status()).toBe(401);
 await login(page.request,'prototype-test','local-test-only-password');await page.goto('/');await expect(page).toHaveURL(/\/admin\//);await expect(page.locator('#app')).toContainText('公共资料');await f.admin.dispose();
});
test('day/week agenda and independent planning text persist in a second browser',async({page,browser})=>{
 const f=await setup(page);await page.goto('/');await expect(page.locator('.day-column')).toHaveCount(7);await page.getByRole('button',{name:'日',exact:true}).click();await expect(page.locator('.day-column')).toHaveCount(1);
 await page.getByRole('button',{name:'＋ 安排'}).click();await page.getByLabel('安排',{exact:true}).fill('跨设备安排');await page.getByRole('button',{name:'保存安排'}).click();await expect(page.getByRole('status')).toContainText('服务器');
 await page.getByRole('button',{name:'打开规划助手'}).click();await page.getByRole('button',{name:'学科状态',exact:true}).click();await page.getByRole('button',{name:'＋ 新建文本'}).click();await page.getByLabel('学科名称').fill('独立目标');await page.getByLabel('状态文本').fill('我手工维护的状态');await page.getByRole('button',{name:'保存文本'}).click();
 const other=await browser.newContext({baseURL});await login(other.request,f.name);const q=await other.newPage();await q.goto('/');await expect(q.locator('.event')).toContainText('跨设备安排');await q.goto('/#planner');await q.getByRole('button',{name:'学科状态',exact:true}).click();await q.getByRole('button',{name:'打开',exact:true}).click();await expect(q.getByLabel('状态文本')).toHaveValue('我手工维护的状态');await other.close();await f.admin.dispose();
});
test('private original bytes, submission review and public archive/restore cross accounts',async({page,browser})=>{
 const f=await setup(page),course=(await call(f.admin,f.a.csrfToken,'/api/courses',{name:'文件课程'+randomUUID().slice(0,6)})).course;
 await page.goto('/#subjects/'+f.subject.id+'/files');await page.locator('input[type=file]').setInputFiles({name:'原件.txt',mimeType:'text/plain',buffer:Buffer.from('字节不变\n123')});await expect(page.locator('.file-row')).toContainText('原件.txt');
 const resources=await (await page.request.get('/api/resources?scope=private')).json();const rid=resources.resources[0].id;expect(await (await page.request.get('/api/resources/'+rid+'/download')).text()).toBe('字节不变\n123');
 const isolated=await browser.newContext({baseURL}),q=await isolated.newPage(),other=await setup(q);expect((await q.request.get('/api/resources/'+rid+'/download')).status()).toBe(404);
 await page.goto('/#submission');await page.locator('select[name=course]').selectOption(course.id);await page.locator('input[type=file]').setInputFiles({name:'投稿原件.txt',mimeType:'text/plain',buffer:Buffer.from('可审核资料')});await page.getByRole('button',{name:'提交审核'}).click();await expect(page.locator('.file-row')).toContainText('审核中');
 const submission=(await (await page.request.get('/api/submissions')).json()).submissions[0];const reviewed=await call(f.admin,f.a.csrfToken,'/api/submissions/'+submission.id+'/review',{decision:'accept',note:'已核对'});await page.reload();await expect(page.locator('.file-row')).toContainText('已收录');
 await q.goto('/#library');await q.getByRole('button',{name:course.name,exact:true}).click();await expect(q.locator('main')).toContainText('投稿原件.txt');
 await call(f.admin,f.a.csrfToken,'/api/admin/resources/'+reviewed.resource.id+'/archive',{});expect((await q.request.get('/api/resources/'+reviewed.resource.id+'/download')).status()).toBe(404);await call(f.admin,f.a.csrfToken,'/api/admin/resources/'+reviewed.resource.id+'/restore',{});expect(await (await q.request.get('/api/resources/'+reviewed.resource.id+'/download')).text()).toBe('可审核资料');
 await isolated.close();await other.admin.dispose();await f.admin.dispose();
});
test('real messages persist and unavailable AI exposes retry without inventing an answer',async({page})=>{
 const f=await setup(page);await page.goto('/#subjects/'+f.subject.id+'/learn');await page.getByRole('textbox',{name:'学习输入'}).fill('测试保存我的问题');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.locator('.message.user')).toContainText('测试保存我的问题');await expect(page.getByRole('button',{name:'重试回答'})).toBeVisible();await page.reload();await expect(page.locator('.message.user')).toContainText('测试保存我的问题');expect(await page.locator('.message.assistant').count()).toBe(0);await f.admin.dispose();
});
test('review documents are persisted, downloadable, editable with stale version rejection',async({page,context})=>{
 const f=await setup(page);const imported=await call(page.request,f.u.csrfToken,'/api/workspace/import',{kind:'document',key:'test-document',data:{subjectId:f.subject.id,title:'我的学习记录',body:'原记录'}});const path='/#subjects/'+f.subject.id+'/review/'+imported.id;await page.goto(path);const other=await context.newPage();await other.goto(path);
 await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('textbox',{name:'内容',exact:true}).fill('真实修改');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.document-body')).toHaveText('真实修改');
 await other.getByRole('button',{name:'编辑',exact:true}).click();await other.getByRole('textbox',{name:'内容',exact:true}).fill('旧版本覆盖');await other.getByRole('button',{name:'保存',exact:true}).click();await expect(other.getByRole('status')).toContainText(/更新|版本|刷新/);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.md$/);await f.admin.dispose();
});
test('administrator inspects readonly records and other-tab logout clears private content',async({page,context})=>{
 const f=await setup(page);await call(page.request,f.u.csrfToken,'/api/workspace/import',{kind:'document',key:'private-inspection',data:{subjectId:f.subject.id,title:'只读检验文档',body:'仅供管理员只读查看'}});
 await login(page.request,'prototype-test','local-test-only-password');await page.goto('/admin/');await page.getByRole('button',{name:'账号与只读检查',exact:true}).click();const card=page.locator('article.card').filter({has:page.getByRole('heading',{name:new RegExp(f.name)})});await card.getByRole('button',{name:'只读查看'}).click();await expect(card).toContainText('只读检验文档');await expect(card.locator('[data-content] textarea')).toHaveCount(0);
 const other=await context.newPage();await other.goto('/admin/');await other.getByRole('button',{name:'退出',exact:true}).click();await expect(page.getByRole('heading',{name:'管理端登录'})).toBeVisible();await expect(page.getByText('仅供管理员只读查看',{exact:true})).toHaveCount(0);await f.admin.dispose();
});
for(const width of [320,390])test(`mobile ${width} main tasks remain reachable`,async({page})=>{
 const f=await setup(page);await page.setViewportSize({width,height:844});await page.goto('/#subjects/'+f.subject.id+'/learn');await expect(page.getByRole('textbox',{name:'学习输入'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.goto('/#subjects/'+f.subject.id+'/files');await expect(page.getByRole('button',{name:'添加文件'})).toBeVisible();await f.admin.dispose();
});
