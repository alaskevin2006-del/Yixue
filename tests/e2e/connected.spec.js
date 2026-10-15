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
 await page.getByRole('button',{name:'打开规划助手'}).click();await page.getByRole('button',{name:'规划笔记',exact:true}).click();await page.getByRole('button',{name:'＋ 新建文本'}).click();await page.getByLabel('笔记名称').fill('独立目标');await page.getByLabel('笔记内容').fill('我手工维护的状态');await page.getByRole('button',{name:'保存文本'}).click();
 const other=await browser.newContext({baseURL});await login(other.request,f.name);const q=await other.newPage();await q.goto('/');await expect(q.locator('.event')).toContainText('跨设备安排');await q.goto('/#planner');await q.getByRole('button',{name:'规划笔记',exact:true}).click();await q.getByRole('button',{name:'打开',exact:true}).click();await expect(q.getByLabel('笔记内容')).toHaveValue('我手工维护的状态');await other.close();await f.admin.dispose();
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

test('empty drafts do not accumulate; Enter sends and Ctrl+Enter inserts newline',async({page})=>{
 const f=await setup(page);await page.goto('/#subjects/'+f.subject.id+'/learn');
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'＋ C++验收 新对话',exact:true}).click();
 expect((await (await page.request.get('/api/subjects/'+f.subject.id+'/conversations')).json()).conversations).toHaveLength(0);
 const input=page.getByRole('textbox',{name:'学习输入'});await input.fill('第一行');await input.press('Control+Enter');await input.press('a');await expect(input).toHaveValue('第一行\na');await input.press('Enter');
 await expect(page.locator('.message.user')).toHaveText('第一行\na');expect((await (await page.request.get('/api/subjects/'+f.subject.id+'/conversations')).json()).conversations).toHaveLength(1);
 await page.goto('/#planner');for(let i=0;i<3;i++)await page.getByRole('button',{name:'＋ 新对话',exact:true}).click();expect((await (await page.request.get('/api/planner')).json()).records.filter(r=>r.kind==='chat')).toHaveLength(0);await f.admin.dispose();
});

test('IME Enter does not send and a calendar click preselects date and time',async({page})=>{
 const f=await setup(page);await page.goto('/#subjects/'+f.subject.id+'/learn');const input=page.getByRole('textbox',{name:'学习输入'});await input.fill('中文选字');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229,bubbles:true});expect((await (await page.request.get('/api/subjects/'+f.subject.id+'/conversations')).json()).conversations).toHaveLength(0);
 await page.goto('/');await page.getByRole('button',{name:'日',exact:true}).click();await page.locator('.calendar-scroll').evaluate(el=>el.scrollTop=0);await page.locator('.day-column').click({position:{x:100,y:100}});await expect(page.getByLabel('开始',{exact:true})).toHaveValue('01:30');await expect(page.getByLabel('结束',{exact:true})).toHaveValue('02:00');await f.admin.dispose();
});

test('compact workspace headers, full width lists and course card navigation',async({page})=>{
 const f=await setup(page),course=(await call(f.admin,f.a.csrfToken,'/api/courses',{name:'卡片课程'+randomUUID().slice(0,5)})).course;
 await page.goto('/#subjects/'+f.subject.id+'/learn');const title=await page.locator('.workspace-heading').boundingBox(),tabs=await page.locator('.workspace-header .tabs').boundingBox();expect(Math.abs(title.y-tabs.y)).toBeLessThan(30);
 const composer=await page.locator('.composer').boundingBox();expect(composer.y+composer.height).toBeLessThan(1000);
 await page.goto('/#subjects/'+f.subject.id+'/review');const list=await page.locator('.documents').boundingBox(),header=await page.locator('.workspace-header').boundingBox();expect(Math.abs(list.x-header.x)).toBeLessThan(2);expect(list.width).toBeGreaterThan(header.width-3);
 await page.goto('/#library');await expect(page.locator('.course-grid')).toBeVisible();await page.getByRole('button',{name:course.name,exact:true}).click();await expect(page).toHaveURL(new RegExp('library/'+course.id));await expect(page.getByRole('link',{name:'‹ 资料库',exact:true})).toBeVisible();
 await page.goto('/#submission');await expect(page.locator('.submission-header .tabs')).toBeVisible();await f.admin.dispose();
});

test('real PDF renders pages without relying on the browser PDF plugin',async({page})=>{
 test.setTimeout(60000);const f=await setup(page);await page.goto('/#subjects/'+f.subject.id+'/files');await page.locator('input[type=file]').setInputFiles('逸学视觉初版.pdf');await expect(page.getByRole('button',{name:/逸学视觉初版.pdf.*私人文件/})).toBeVisible({timeout:30000});await page.getByRole('button',{name:/逸学视觉初版.pdf.*私人文件/}).click();await expect(page.locator('#file-preview canvas')).toBeVisible();await expect(page.getByText('第 1 / 39 页',{exact:true})).toBeVisible();await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.getByText('第 2 / 39 页',{exact:true})).toBeVisible();await f.admin.dispose();
});

test('planner preserves next draft while a response completes',async({page})=>{
 const f=await setup(page);await page.goto('/#planner/new');let release,arrived;const pending=new Promise(resolve=>arrived=resolve),gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/planner/chats/*/messages',async route=>{arrived();await gate;await route.fulfill({status:200,contentType:'application/json',body:'{}'});});
 const input=page.locator('textarea[name=content]');await input.fill('第一条消息');await input.press('Enter');await pending;await input.fill('AI回复期间写的下一条');release();await expect(page.getByRole('button',{name:'发送',exact:true})).toBeEnabled();await expect(input).toHaveValue('AI回复期间写的下一条');await f.admin.dispose();
});

test('last calendar slot stays within valid same-day time',async({page})=>{
 const f=await setup(page);await page.goto('/');await page.getByRole('button',{name:'日',exact:true}).click();await page.locator('.day-column').evaluate(el=>{const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+20,clientY:r.top+23.75*64}));});await expect(page.getByLabel('开始',{exact:true})).toHaveValue('23:30');await expect(page.getByLabel('结束',{exact:true})).toHaveValue('23:59');await page.getByLabel('安排',{exact:true}).fill('深夜安排');await page.getByRole('button',{name:'保存安排'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await f.admin.dispose();
});

test('confirmation uses the displayed proposal even after background state reload',async({page})=>{
 const f=await setup(page),chat=(await call(page.request,f.u.csrfToken,'/api/planner/records',{kind:'chat',title:'确认绑定'})).record;let current='A',sent;
 await page.route('**/api/planner',async route=>{const response=await route.fetch(),data=await response.json();data.records=data.records.map(r=>r.id===chat.id?{...r,proposal:{id:current,status:'pending'},messages:[{role:'assistant',content:'待确认方案'+current}]}:r);await route.fulfill({response,json:data});});
 await page.goto('/#planner/'+chat.id);await expect(page.locator('.messages')).toContainText('待确认方案A');current='B';await page.getByRole('button',{name:'规划笔记',exact:true}).click();await page.getByRole('button',{name:'＋ 新建文本'}).click();await page.getByLabel('笔记名称').fill('手动保存');await page.getByLabel('笔记内容').fill('触发状态刷新');await page.getByRole('button',{name:'保存文本'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.messages')).toContainText('待确认方案A');
 await page.route('**/api/planner/chats/*/messages',async route=>{sent=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:'{}'});});await page.locator('textarea[name=content]').fill('确认');await page.locator('textarea[name=content]').press('Enter');await expect.poll(()=>sent?.proposalId).toBe('A');await f.admin.dispose();
});

test('learning replies render compact Markdown and math while preserving code and blocking active content',async({page})=>{
 const f=await setup(page),conversation=(await call(page.request,f.u.csrfToken,'/api/subjects/'+f.subject.id+'/conversations',{})).conversation;
 const reply=['#### 单点修改 `add(x, k)`','','- `tree[i]` 保存区间的和。','- **lowbit** 是最低位。','','例如：','','```cpp','if (x < 4) {','  x += lowbit(x);','}','```','','行内公式 $x^2$','','| 字段 | 含义 |','| --- | --- |','| x | 下标 |','','<img src="https://example.invalid/tracker" onerror="window.__unsafe=1"><script>window.__unsafe=1</script>','[危险链接](javascript:alert(1))'].join('\n');
 await page.route('**/api/conversations/'+conversation.id+'/messages',route=>route.fulfill({json:{messages:[{role:'user',content:'保持原样：#### 和 `code`'},{role:'assistant',content:reply}],runs:[]}}));await page.goto('/#subjects/'+f.subject.id+'/conversations/'+conversation.id);
 const body=page.locator('.message.assistant .message-content');await expect(body.locator('h4')).toContainText('单点修改');await expect(body.locator('ul li')).toHaveCount(2);await expect(body.locator('pre code')).toContainText('  x += lowbit(x);');await expect(body.locator('.katex')).toHaveCount(1);await expect(body.locator('table')).toHaveCount(1);await expect(body.locator('img,script,iframe')).toHaveCount(0);expect(await page.evaluate(()=>window.__unsafe)).toBeUndefined();expect((await body.locator('a').getAttribute('href'))??'').not.toMatch(/^javascript:/);await expect(page.locator('.message.user')).toContainText('#### 和 `code`');
 const metrics=await body.evaluate(el=>{const s=getComputedStyle(el.querySelector('.rich-text'));return {line:parseFloat(s.lineHeight),size:parseFloat(s.fontSize),height:el.getBoundingClientRect().height};});expect(metrics.line/metrics.size).toBeLessThanOrEqual(1.65);expect(metrics.height).toBeLessThan(600);
 await page.screenshot({path:'tmp/compact-chat-desktop.png'});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.getByRole('button',{name:'发送',exact:true})).toBeInViewport();await page.screenshot({path:'tmp/compact-chat-mobile.png'});await f.admin.dispose();
});
