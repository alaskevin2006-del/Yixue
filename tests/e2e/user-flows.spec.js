import {test,expect} from '@playwright/test';
test('home preserves day/week and opens independent planner',async({page})=>{
 await page.goto('/');await expect(page.locator('.calendar.week')).toBeVisible();
 await page.getByRole('button',{name:'日',exact:true}).click();await expect(page.locator('.calendar.day')).toBeVisible();
 await page.getByRole('button',{name:'周',exact:true}).click();await expect(page.locator('.day-column')).toHaveCount(7);
 await page.getByRole('button',{name:'打开规划助手'}).click();await expect(page.getByRole('heading',{name:'规划助手',exact:true})).toBeVisible();await expect(page.locator('.calendar')).toHaveCount(0);
 await page.getByRole('textbox',{name:'规划输入'}).fill('今晚只剩20分钟');await page.getByRole('button',{name:'发送',exact:true}).click();await page.reload();await expect(page.getByText('今晚只剩20分钟',{exact:true})).toBeVisible();
});
test('review is a list, editable document persists, download and delete undo work',async({page})=>{
 await page.goto('/#subjects/cpp/review');await expect(page.locator('.document-row')).toHaveCount(2);
 await expect(page.getByText('待你确认')).toHaveCount(0);
 await page.locator('.document-row a').first().click();await page.getByRole('button',{name:'编辑',exact:true}).click();
 await page.getByRole('textbox',{name:'内容',exact:true}).fill('验收：我容易把两个分支混在一起。');await page.getByRole('button',{name:'保存',exact:true}).click();await page.reload();await expect(page.locator('.document-body')).toHaveText('验收：我容易把两个分支混在一起。');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.md$/);
 await page.getByRole('button',{name:'删除',exact:true}).click();await expect(page.locator('.document-row')).toHaveCount(1);await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.document-row')).toHaveCount(2);
});
test('foreign conversation and document routes cannot show another subject',async({page})=>{
 await page.goto('/#subjects/math/learn/cpp-erase');await expect(page.getByRole('heading',{name:'对话不存在或不属于当前学科'})).toBeVisible();await expect(page.getByText('删除时不再递增',{exact:false})).toHaveCount(0);
 await page.goto('/#subjects/math/review/loop');await expect(page.getByText('记录已删除或不存在')).toBeVisible();
 await page.goto('/#subjects/math/learn');await expect(page.getByRole('button',{name:'＋ 高等数学 新对话'})).toBeVisible();await expect(page.getByRole('button',{name:'模板参数推导',exact:true})).toHaveCount(0);
});
test('private files keep exact bytes and remain isolated from other subjects and submissions',async({page})=>{
 await page.goto('/#subjects/cpp/files');await page.locator('input[type=file]').setInputFiles({name:'测试记录.txt',mimeType:'text/plain',buffer:Buffer.from('原始文件内容')});
 await expect(page.getByText('测试记录.txt',{exact:true})).toBeVisible();await page.getByRole('button',{name:'测试记录.txt',exact:false}).click();await expect(page.locator('.file-text')).toHaveText('原始文件内容');await page.getByRole('dialog').getByRole('button',{name:'×',exact:true}).click();await page.reload();await expect(page.getByText('测试记录.txt',{exact:true})).toBeVisible();
 await page.goto('/#subjects/math/files');await expect(page.getByText('测试记录.txt',{exact:true})).toHaveCount(0);
 await page.goto('/#submission/mine');await expect(page.getByText('测试记录.txt',{exact:true})).toHaveCount(0);
});
test('library has a single submission entry, mine stays inside and drafts are truthful',async({page})=>{
 await page.goto('/#library');await expect(page.getByRole('link',{name:'我要投稿',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'我的投稿',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'我要投稿',exact:true}).click();await expect(page.getByRole('link',{name:'我的投稿',exact:true})).toBeVisible();
 await page.locator('input[type=file]').setInputFiles({name:'投稿.txt',mimeType:'text/plain',buffer:Buffer.from('投稿内容')});await page.getByRole('button',{name:'保存投稿草稿'}).click();await expect(page.getByText('投稿.txt',{exact:true})).toBeVisible();await expect(page.getByText('本机草稿，未送审',{exact:false}).first()).toBeVisible();
});
test('document drafts survive navigating away and returning without saving',async({page})=>{
 await page.goto('/#subjects/cpp/review/loop');await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('textbox',{name:'内容',exact:true}).fill('还没有保存的草稿');await page.getByRole('link',{name:'资料库',exact:true}).click();await page.goto('/#subjects/cpp/review/loop');await expect(page.getByRole('textbox',{name:'内容',exact:true})).toHaveValue('还没有保存的草稿');
});
test('second tab cannot overwrite newer text without reloading',async({page,context})=>{
 await page.goto('/#subjects/cpp/review/loop');const other=await context.newPage();await other.goto('/#subjects/cpp/review/loop');
 await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('textbox',{name:'内容',exact:true}).fill('第一个窗口的内容');await page.getByRole('button',{name:'保存',exact:true}).click();
 await other.getByRole('button',{name:'编辑',exact:true}).click();await other.getByRole('textbox',{name:'内容',exact:true}).fill('旧窗口尝试覆盖');await other.getByRole('button',{name:'保存',exact:true}).click();await expect(other.getByRole('status')).toContainText('刷新');
 await page.reload();await expect(page.locator('.document-body')).toHaveText('第一个窗口的内容');
});
for(const width of [320,390])test(`mobile ${width} keeps chat and document controls reachable`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/#subjects/cpp/learn');await page.getByRole('button',{name:'对话',exact:true}).click();await page.getByRole('button',{name:'＋ C++ 新对话'}).click();await page.getByRole('textbox',{name:'学习输入',exact:true}).fill('手机提问');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.getByText('手机提问',{exact:true}).last()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.getByRole('link',{name:'回顾',exact:true}).click();await page.locator('.document-row a').first().click();await expect(page.getByRole('button',{name:'编辑',exact:true})).toBeVisible();
});

test('planner download and cancel never submit unsaved edits',async({page})=>{
 await page.goto('/#planner');await page.getByRole('button',{name:'学科状态',exact:true}).click();await page.getByRole('button',{name:'打开',exact:true}).first().click();
 const field=page.getByRole('textbox',{name:'状态文本',exact:true});const original=await field.inputValue();await field.fill('未保存的状态');const download=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'下载',exact:true}).click();await download;await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'学科状态',exact:true}).click();await page.getByRole('button',{name:'打开',exact:true}).first().click();await expect(field).toHaveValue(original);
});
test('empty subjects do not share an unsent conversation draft',async({page})=>{
 await page.goto('/#subjects');for(const name of ['独立甲','独立乙']){await page.goto('/#subjects');await page.getByRole('button',{name:'＋ 添加学科'}).click();await page.getByRole('textbox',{name:'学科名称'}).fill(name);await page.getByRole('button',{name:'添加',exact:true}).click();if(name==='独立甲')await page.getByRole('textbox',{name:'学习输入'}).fill('甲的私有草稿');}
 await expect(page.getByRole('textbox',{name:'学习输入'})).toHaveValue('');await page.getByRole('link',{name:'学科空间',exact:true}).click();await page.getByRole('link',{name:'独立甲',exact:false}).click();await expect(page.getByRole('textbox',{name:'学习输入'})).toHaveValue('甲的私有草稿');
});
test('private file picker is keyboard operable',async({page})=>{
 await page.goto('/#subjects/cpp/files');const add=page.getByRole('button',{name:'添加文件',exact:true});await add.focus();const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Enter');await (await chooser).setFiles({name:'键盘.txt',mimeType:'text/plain',buffer:Buffer.from('可访问')});await expect(page.getByText('键盘.txt',{exact:true})).toBeVisible();
});
