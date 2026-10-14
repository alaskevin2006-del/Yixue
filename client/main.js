import {isSessionActive} from './session-state.js';
import {dateKey,reduce,scoped} from './model.js';
import {loadState,saveState,files,STATE_KEY} from './storage.js';
import {courses,resources,candidates} from './fixtures.js';
import * as view from './views.js';
const {h,btn}=view;
const main=document.querySelector('main'),dialog=document.querySelector('#dialog'),notice=document.querySelector('#notice');
const id=()=>globalThis.crypto?.randomUUID?.()??`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let state,loadError,undo=null,routeVersion=0,previewUrl=null,storageRevision=null;
try{state=loadState();storageRevision=localStorage.getItem(STATE_KEY);}catch(e){loadError=e;}
const ui={page:'home',date:new Date(),calendarMode:'week',course:'cpp',libraryQuery:'',resourceType:'',resourceYear:'',subjectQuery:'',fileQuery:'',fileList:[],fileLoading:false,historyOpen:false,drafts:{},documentDrafts:{},documentDraft:null,documentEditing:false};
function tell(message,undoAction=null){undo=undoAction;notice.hidden=false;notice.innerHTML=`<span>${h(message)}</span>${undo?btn('撤销','undo'):''}${btn('×','notice-close','','icon-button')}`;}
function commit(action){if(!isSessionActive())throw new Error('请先登录。');if(localStorage.getItem(STATE_KEY)!==storageRevision)throw new Error('另一个窗口已更新数据，请刷新后继续。当前操作未保存。');const next=reduce(state,action);try{saveState(next);}catch{throw new Error('未能保存：浏览器存储可能已满或被禁用。原内容未更改，请下载备份。');}state=next;storageRevision=JSON.stringify(next);}
function go(path){if(location.hash==='#'+path)route();else location.hash=path;}
function subjectRoute(tab=ui.tab,tail=''){return `subjects/${encodeURIComponent(ui.subjectId)}/${tab}${tail?'/'+encodeURIComponent(tail):''}`;}
function chat(){return state.chats.find(c=>c.id===ui.chatId&&c.subjectId===ui.subjectId);}
function doc(){return scoped(state,ui.subjectId).documents.find(d=>d.id===ui.documentId);}
function captureDraft(){const el=main.querySelector('textarea[name=content]');if(el)ui.drafts[(ui.page==='planner'?'planner:':'chat:'+ui.subjectId+':')+(ui.page==='planner'?ui.plannerId:ui.chatId)]=el.value;}
function render(){
 if(!isSessionActive())return;
 if(loadError){main.innerHTML=`<section class="page"><h1>无法读取本机数据</h1><p>${h(loadError.message)}</p><p>请勿清除浏览器数据。可以先下载现有备份。</p>${btn('下载原始数据','backup')}</section>`;return;}
 document.querySelectorAll('.topbar nav a').forEach(a=>{const section=ui.page==='planner'?'home':ui.page==='submission'?'library':ui.page==='workspace'||ui.page==='document'?'subjects':ui.page;const active=a.hash==='#'+section;a.classList.toggle('selected',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 try{main.innerHTML=ui.page==='home'?view.home(state,ui):ui.page==='planner'?view.planner(state,ui):ui.page==='library'?view.library(ui):ui.page==='submission'?view.submission(ui):ui.page==='subjects'?view.subjects(state,ui):ui.page==='document'?view.documentView(state,ui):view.workspace(state,ui);}catch(e){main.innerHTML=`<section class="page"><h1>无法打开这项内容</h1><p>${h(e.message)}</p><a href="#subjects">返回学科空间</a></section>`;}
 if(ui.page==='home') {const sc=main.querySelector('.calendar-scroll');sc.scrollTop=ui.calendarScroll??Math.max(0,(new Date().getHours()-2)*64);}
}
async function refreshFiles(){const version=routeVersion,domain=ui.page==='submission'?'submission':'private',subjectId=ui.subjectId;ui.fileLoading=true;ui.fileList=[];render();try{const list=await files.list(domain,subjectId);if(version===routeVersion){ui.fileList=list;ui.fileLoading=false;const target=main.querySelector('.resource-list');if(target&&isSessionActive())target.innerHTML=view.fileRows(list.filter(f=>domain==='submission'||f.name.toLowerCase().includes(ui.fileQuery.toLowerCase())),domain);}}catch{if(version===routeVersion){ui.fileLoading=false;render();tell('无法读取本机文件，请检查浏览器存储权限。');}}}
function closeDialog(){dialog.close();if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
function modal(title,body){if(!isSessionActive())return false;closeDialog();dialog.innerHTML=`<header class="dialog-head"><h2 id="dialog-title">${h(title)}</h2>${btn('×','dialog-close','','icon-button')}</header><div class="dialog-body">${body}</div>`;dialog.showModal();return true;}
async function route(){
 if(!isSessionActive())return;
 captureDraft();if(ui.documentEditing&&ui.documentDraft)ui.documentDrafts[ui.documentId]=ui.documentDraft;routeVersion++;closeDialog();ui.historyOpen=false;ui.documentEditing=false;ui.documentDraft=null;
 let parts;try{parts=location.hash.slice(1).split('/').map(decodeURIComponent);}catch{tell('地址无效');go('home');return;}
 const [section,subjectId,tab,tail]=parts;
 if(!state){render();return;}
 if(section==='subjects'&&subjectId){ui.subjectId=subjectId;ui.tab=['learn','review','files'].includes(tab)?tab:'learn';ui.page=ui.tab==='review'&&tail?'document':'workspace';ui.documentId=tail;const list=state.chats.filter(c=>c.subjectId===subjectId);ui.chatId=ui.tab==='learn'&&tail?tail:list[0]?.id;if(ui.tab==='learn'&&tail&&!list.some(c=>c.id===tail)){main.innerHTML=`<section class="page"><h1>对话不存在或不属于当前学科</h1><a href="#subjects/${encodeURIComponent(subjectId)}/learn">返回当前学科</a></section>`;return;}}
 else if(section==='planner'){ui.page='planner';ui.plannerId=subjectId&&state.planner.chats.some(c=>c.id===subjectId)?subjectId:state.planner.chats[0]?.id;}
 else if(section==='submission'){ui.page='submission';ui.mySubmissions=subjectId==='mine';}
 else ui.page=['home','library','subjects'].includes(section)?section:'home';
 if(ui.page==='document'&&ui.documentDrafts[ui.documentId]){ui.documentEditing=true;ui.documentDraft=ui.documentDrafts[ui.documentId];}
 render();if((ui.page==='workspace'&&ui.tab==='files')||(ui.page==='submission'&&ui.mySubmissions))await refreshFiles();
}
function download(name,body,type='text/plain;charset=utf-8'){if(!isSessionActive())return;const blob=body instanceof Blob?body:new Blob([body],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function currentFile(file){return file&&(ui.page==='submission'?file.domain==='submission':ui.page==='workspace'&&ui.tab==='files'&&file.domain==='private'&&file.subjectId===ui.subjectId);}
async function checkedFile(key){const f=await files.get(key);if(!isSessionActive())throw new Error('请先登录。');if(!currentFile(f))throw new Error('文件不存在或不属于当前页面');return f;}
function validateFile(file){if(!(file instanceof File)||!file.name)throw new Error('请选择文件');if(file.size>50*1024*1024)throw new Error('单个文件最大50 MB，请选择更小的文件。');}
async function openFile(f){if(!modal(f.name,`<p class="muted">${Math.max(1,Math.ceil(f.size/1024))} KB · ${f.domain==='submission'?'投稿草稿，未送审':'私人文件'}</p>${f.description?`<p>${h(f.description)}</p>`:''}<div id="file-preview">正在读取…</div><div class="actions">${btn('下载原文件','file-download',f.id,'primary')}</div>`))return;
 const target=dialog.querySelector('#file-preview');
 if(/^text\//.test(f.blob.type)||/\.(txt|md|csv|json|js|py|cpp|h|css|log)$/i.test(f.name)){target.textContent=(await f.blob.slice(0,250000).text())+(f.size>250000?'\n\n预览仅显示前250 KB，请下载查看完整内容。':'');target.className='file-text';}
 else if(/^image\/(png|jpeg|gif|webp)$/.test(f.blob.type)){previewUrl=URL.createObjectURL(f.blob);const image=document.createElement('img');image.src=previewUrl;image.alt=f.name;image.className='file-image';target.replaceChildren(image);}
 else if(f.blob.type==='application/pdf'){previewUrl=URL.createObjectURL(f.blob);const frame=document.createElement('iframe');frame.src=previewUrl;frame.title=f.name;frame.setAttribute('sandbox','');frame.className='pdf-preview';target.replaceChildren(frame);}
 else target.textContent='此文件暂不支持在线预览，可下载原文件打开。';
}
function eventEditor(key){const e=state.agenda.find(e=>e.id===key)??{id:id(),title:'',date:dateKey(ui.date),start:'15:00',end:'15:30'};modal(key?'编辑安排':'添加安排',`<form data-form="event" data-id="${h(e.id)}"><label>安排<input name="title" maxlength="160" required value="${h(e.title)}"></label><label>日期<input type="date" name="date" required value="${e.date}"></label><div class="form-pair"><label>开始<input type="time" name="start" required value="${e.start}"></label><label>结束<input type="time" name="end" required value="${e.end}"></label></div><div class="actions"><button class="primary" type="submit">保存安排</button>${key?btn('删除安排','event-delete',key):''}${btn('取消','dialog-close')}</div></form>`);}
function plannerTexts(){modal('学科状态',`<p class="muted">独立的文本记录。不会读取学科空间，也不会随聊天或日程自动更新。</p><div class="document-list">${state.planner.texts.map(t=>`<div class="document-row"><button class="row-main" data-action="planner-text-open" data-id="${t.id}"><strong>${h(t.name)}</strong><span>${h(t.body.slice(0,60))}</span></button>${btn('打开','planner-text-open',t.id)}</div>`).join('')}</div>${btn('＋ 新建文本','planner-text-new','','outline')}`);}
function textEditor(key){const t=state.planner.texts.find(t=>t.id===key)??{id:id(),name:'',body:''};modal('编辑学科状态',`<form data-form="planner-text" data-id="${h(t.id)}"><label>学科名称<input name="name" maxlength="80" required value="${h(t.name)}"></label><label>状态文本<textarea name="body" class="text-editor" required maxlength="50000" placeholder="自然记录目标、当前情况或下一步方向…">${h(t.body)}</textarea></label><div class="actions"><button class="primary" type="submit">保存文本</button>${key?btn('下载','planner-text-download',key):''}${btn('取消','dialog-close')}</div><p class="footnote">仅在你保存时更新，不会自动修改日程。</p></form>`);}
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,key=b.dataset.id;captureDraft();
 try{switch(action){
 case 'about':modal('关于此原型','<p>当前用于验收页面结构与交互。示例内容不是你的真实学习数据。</p><p>编辑的文本、聊天与添加的文件仅保存在当前浏览器，不会跨设备同步。真实 AI、文件上传和审核服务尚未接入。</p><p>回顾文档可下载备份；资料文件与投稿草稿相互独立。</p>');break;
 case 'backup':download('yixue-browser-backup.json',localStorage.getItem(STATE_KEY)??'{}');break;
 case 'notice-close':notice.hidden=true;break;
 case 'dialog-close':closeDialog();break;
 case 'undo':if(undo){const run=undo;await run();undo=null;notice.hidden=true;render();}break;
 case 'date-prev':case 'date-next':ui.date.setDate(ui.date.getDate()+(action==='date-next'?1:-1)*(ui.calendarMode==='week'?7:1));ui.calendarScroll=main.querySelector('.calendar-scroll').scrollTop;render();break;
 case 'date-today':ui.date=new Date();ui.calendarScroll=null;render();break;
 case 'calendar-mode':ui.calendarMode=key;ui.calendarScroll=null;render();break;
 case 'calendar-day':ui.date=new Date(key+'T12:00:00');ui.calendarMode='day';render();break;
 case 'event-new':eventEditor();break;case 'event-open':eventEditor(key);break;
 case 'event-delete':{const old=state.agenda.find(e=>e.id===key);commit({type:'agenda.delete',id:key});closeDialog();render();tell('安排已删除',()=>commit({type:'agenda.save',...old}));break;}
 case 'planner-open':go('planner');break;
 case 'planner-new':{const key=id();commit({type:'planner.create',id:key});go('planner/'+key);break;}
 case 'planner-select':go('planner/'+key);break;
 case 'planner-texts':plannerTexts();break;case 'planner-text-open':textEditor(key);break;case 'planner-text-new':textEditor();break;
 case 'planner-text-download':{const t=state.planner.texts.find(t=>t.id===key);download(t.name+'-学科状态.txt',t.body);break;}
 case 'toggle-history':ui.historyOpen=!ui.historyOpen;render();break;
 case 'course':ui.course=key;ui.libraryQuery='';render();break;
 case 'public-open':{const r=resources.find(r=>r.id===key);modal(r.name,`<p class="muted">${h(r.type)} · ${r.year} · 公共资料示例</p><article class="file-text">${h(r.body)}</article><div class="actions">${btn('下载文件','public-download',r.id,'primary')}</div>`);break;}
 case 'public-download':{const r=resources.find(r=>r.id===key);download(r.name,r.body);break;}
 case 'subject-new':modal('添加学科','<form data-form="subject"><label>学科名称<input name="name" required maxlength="80" placeholder="例如：操作系统"></label><div class="actions"><button class="primary" type="submit">添加</button>'+btn('取消','dialog-close')+'</div></form>');break;
 case 'chat-new':{const key=id();commit({type:'chat.create',subjectId:ui.subjectId,id:key});go(subjectRoute('learn',key));break;}
 case 'chat-select':go(subjectRoute('learn',key));break;
 case 'chat-delete':{const old=state.chats.find(c=>c.id===key&&c.subjectId===ui.subjectId);commit({type:'chat.delete',subjectId:ui.subjectId,id:key});go(subjectRoute('learn'));tell('对话已删除，已有学习记录不会被删除',()=>commit({type:'chat.restore',chat:old}));break;}
 case 'candidate':{const c=chat();if(c?.id!==key||!candidates[key])throw new Error('没有候选内容');const candidate=candidates[key];const old=state.documents.find(d=>d.id===candidate.id&&d.subjectId===ui.subjectId);modal('整理学习记录',`<p class="muted">这是基于示例对话预置的候选内容。可以修改后保留，也可以忽略。</p><form data-form="candidate" data-id="${candidate.id}" data-source="${key}"><label>标题<input name="title" required maxlength="160" value="${h(old?.title??candidate.title)}"></label><label>内容<textarea name="body" class="text-editor" required maxlength="50000">${h(old?.body??candidate.body)}</textarea></label><div class="actions"><button class="primary" type="submit">${old?'更新这条记录':'保留到回顾'}</button>${btn('忽略','dialog-close')}</div></form>`);break;}
 case 'document-edit':ui.documentDraft=structuredClone(doc());ui.documentEditing=true;render();break;
 case 'document-cancel':ui.documentEditing=false;ui.documentDraft=null;delete ui.documentDrafts[ui.documentId];render();break;
 case 'document-download':{const d=scoped(state,ui.subjectId).documents.find(d=>d.id===key);download(d.title+'.md',`# ${d.title}\n\n${d.body}\n`,'text/markdown;charset=utf-8');break;}
 case 'document-delete':{const old=scoped(state,ui.subjectId).documents.find(d=>d.id===key);commit({type:'document.delete',subjectId:ui.subjectId,id:key});if(ui.page==='document')go(subjectRoute('review'));else render();tell('学习记录已删除',()=>commit({type:'document.restore',document:old}));break;}
 case 'file-add':main.querySelector('[data-upload=private]').click();break;
 case 'file-open':await openFile(await checkedFile(key));break;
 case 'file-download':{const f=await checkedFile(key);download(f.name,f.blob);break;}
 case 'file-delete':{const f=await checkedFile(key);await files.delete(key);await refreshFiles();tell('文件已删除',async()=>{await files.put(f);await refreshFiles();});break;}
 }}catch(e){tell(e.message||'操作未完成，请重试。');}
});
document.addEventListener('submit',async event=>{
 const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();const data=new FormData(form),kind=form.dataset.form,submit=form.querySelector('[type=submit]');submit.disabled=true;
 try{switch(kind){
 case 'subject':{const key=id();commit({type:'subject.create',id:key,name:data.get('name')});closeDialog();go('subjects/'+key+'/learn');break;}
 case 'event':commit({type:'agenda.save',id:form.dataset.id,...Object.fromEntries(data)});closeDialog();render();tell('安排已保存在本浏览器');break;
 case 'planner':commit({type:'planner.send',id:ui.plannerId,content:data.get('content')});ui.drafts['planner:'+ui.plannerId]='';render();tell('消息已保存。AI 尚未接入，学科状态没有改变。');break;
 case 'learning':{if(!chat()){const key=id();commit({type:'chat.create',subjectId:ui.subjectId,id:key});ui.chatId=key;}commit({type:'message.add',subjectId:ui.subjectId,id:ui.chatId,content:data.get('content')});ui.drafts['chat:'+ui.subjectId+':'+ui.chatId]='';render();tell('消息已保存在本浏览器');break;}
 case 'planner-text':commit({type:'planner.text',id:form.dataset.id,name:data.get('name'),body:data.get('body')});closeDialog();tell('文本已保存在本浏览器，日程没有改变');break;
 case 'document':commit({type:'document.save',subjectId:ui.subjectId,id:ui.documentId,title:data.get('title'),body:data.get('body')});ui.documentEditing=false;ui.documentDraft=null;delete ui.documentDrafts[ui.documentId];render();tell('学习记录已保存在本浏览器');break;
 case 'candidate':commit({type:'document.save',subjectId:ui.subjectId,id:form.dataset.id,title:data.get('title'),body:data.get('body'),sourceId:form.dataset.source});closeDialog();go(subjectRoute('review',form.dataset.id));tell('已保留到当前学科的回顾');break;
 case 'submission':{const file=data.get('file');validateFile(file);await files.put({id:id(),domain:'submission',name:file.name,size:file.size,blob:file,course:data.get('course'),description:data.get('description'),createdAt:new Date().toISOString()});go('submission/mine');tell('投稿草稿已保存在本浏览器，尚未上传或送审');break;}
 }}catch(e){tell(e.message||'保存未完成，请检查浏览器存储空间。');}finally{if(submit.isConnected)submit.disabled=false;}
});
document.addEventListener('input',event=>{const el=event.target;if(el.matches('textarea[name=content]'))captureDraft();if(ui.documentEditing&&el.closest('[data-form=document]')){ui.documentDraft={...ui.documentDraft,[el.name]:el.value};}
 if(el.dataset.search){const keys={library:'libraryQuery',subject:'subjectQuery',files:'fileQuery'};ui[keys[el.dataset.search]]=el.value;const selector=el.dataset.search,position=el.selectionStart;render();const replacement=main.querySelector(`[data-search="${selector}"]`);replacement.focus();if(replacement.type!=='search')replacement.setSelectionRange(position,position);}
});
document.addEventListener('change',async event=>{const el=event.target;if(el.dataset.filter){ui[el.dataset.filter==='type'?'resourceType':'resourceYear']=el.value;render();}
 if(el.dataset.upload==='private'){const subjectId=ui.subjectId;let saved=0;try{for(const file of el.files){validateFile(file);await files.put({id:id(),domain:'private',subjectId,name:file.name,size:file.size,blob:file,createdAt:new Date().toISOString()});saved++;}if(ui.subjectId===subjectId&&ui.tab==='files')await refreshFiles();tell(`${saved} 个文件已保存到本浏览器`);}catch(e){if(ui.subjectId===subjectId&&ui.tab==='files')await refreshFiles();tell(`已保存 ${saved} 个文件。${e.message||'其余文件保存失败'}`);}}
});
dialog.addEventListener('close',()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}});
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',event=>{if(isSessionActive()&&ui.documentEditing&&ui.documentDraft&&(ui.documentDraft.body!==doc()?.body||ui.documentDraft.title!==doc()?.title)){event.preventDefault();event.returnValue='';}});
window.addEventListener('storage',event=>{if(event.key===STATE_KEY)tell('另一个窗口修改了数据。请刷新后继续，避免覆盖。');});
route();
