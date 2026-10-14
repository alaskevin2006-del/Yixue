import {isSessionActive} from './session-state.js';
import {dateKey,scoped} from './model.js';
import {STATE_KEY} from './storage.js';
import {api} from './api.js';
import {browserSources,readBrowserBackup,exportBackup,parseBackup,importItems,importBackup} from './migration.js';
import {createAnswerPoller,loadCloud,mutate,cloudFiles as files,fileUrl,candidatesFor,decideCandidate,retryChat} from './cloud.js';
let courses=[],resources=[];
import * as view from './views.js';
const {h,btn}=view;
const main=document.querySelector('main'),dialog=document.querySelector('#dialog'),notice=document.querySelector('#notice');
const id=()=>globalThis.crypto?.randomUUID?.()??`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let state,loadError,undo=null,routeVersion=0,previewUrl=null;

const ui={page:'home',date:new Date(),calendarMode:'week',course:'cpp',libraryQuery:'',resourceType:'',resourceYear:'',subjectQuery:'',fileQuery:'',fileList:[],fileLoading:false,historyOpen:false,drafts:{},documentDrafts:{},documentDraft:null,documentEditing:false};
function tell(message,undoAction=null){if(!isSessionActive())return;undo=undoAction;notice.hidden=false;notice.innerHTML=`<span>${h(message)}</span>${undo?btn('撤销','undo'):''}${btn('×','notice-close','','icon-button')}`;}
let loadGeneration=0;
async function reload(){const generation=++loadGeneration;const result=await loadCloud({chatId:ui.chatId});if(!isSessionActive()||generation!==loadGeneration)return;state=result.state;courses=result.courses;resources=result.resources;ui.courses=courses;ui.resources=resources;if(!courses.some(c=>c.id===ui.course))ui.course=courses[0]?.id;}
async function commit(action){if(!isSessionActive())throw new Error('请先登录。');const version=routeVersion;const result=await mutate(state,action);await reload();if(version!==routeVersion)throw new DOMException('已保存，页面已切换','AbortError');return result;}
const answerPoller=createAnswerPoller({getCurrent:()=>({id:ui.chatId,subjectId:ui.subjectId,routeVersion,active:isSessionActive()&&ui.page==='workspace'&&ui.tab==='learn',runs:state?.chats.find(c=>c.id===ui.chatId&&c.subjectId===ui.subjectId)?.runs}),onUpdate:(detail,selected)=>{const current=state.chats.find(c=>c.id===selected.id&&c.subjectId===selected.subjectId);if(!current)return;captureDraft();current.messages=detail.messages;current.runs=detail.runs;render();},onError:error=>tell(error.message+' 请刷新页面继续检查回答。')});
function pollAnswers(){answerPoller.refresh();}

function go(path){if(!isSessionActive())return;if(location.hash==='#'+path)route();else location.hash=path;}
function subjectRoute(tab=ui.tab,tail=''){return `subjects/${encodeURIComponent(ui.subjectId)}/${tab}${tail?'/'+encodeURIComponent(tail):''}`;}
function chat(){return state.chats.find(c=>c.id===ui.chatId&&c.subjectId===ui.subjectId);}
function doc(){return scoped(state,ui.subjectId).documents.find(d=>d.id===ui.documentId);}
function captureDraft(){const el=main.querySelector('textarea[name=content]');if(el)ui.drafts[(ui.page==='planner'?'planner:':'chat:'+ui.subjectId+':')+(ui.page==='planner'?ui.plannerId:ui.chatId)]=el.value;}
function render(){
 if(!isSessionActive())return;
 if(loadError){main.innerHTML=`<section class="page"><h1>无法读取服务器数据</h1><p>${h(loadError.message)}</p><p>请检查网络后刷新。旧浏览器数据仍然保留。</p>${btn('下载原始数据','backup')}</section>`;return;}
 document.querySelectorAll('.topbar nav a').forEach(a=>{const section=ui.page==='planner'?'home':ui.page==='submission'?'library':ui.page==='workspace'||ui.page==='document'?'subjects':ui.page;const active=a.hash==='#'+section;a.classList.toggle('selected',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 try{main.innerHTML=ui.page==='home'?view.home(state,ui):ui.page==='planner'?view.planner(state,ui):ui.page==='library'?view.library(ui):ui.page==='submission'?view.submission(ui):ui.page==='subjects'?view.subjects(state,ui):ui.page==='document'?view.documentView(state,ui):view.workspace(state,ui);}catch(e){main.innerHTML=`<section class="page"><h1>无法打开这项内容</h1><p>${h(e.message)}</p><a href="#subjects">返回学科空间</a></section>`;}
 if(ui.page==='home') {const sc=main.querySelector('.calendar-scroll');sc.scrollTop=ui.calendarScroll??Math.max(0,(new Date().getHours()-2)*64);}
}
async function refreshFiles(){const version=routeVersion,domain=ui.page==='submission'?'submission':'private',subjectId=ui.subjectId;ui.fileLoading=true;ui.fileList=[];render();try{const list=await files.list(domain,subjectId);if(version===routeVersion){ui.fileList=list;ui.fileLoading=false;const target=main.querySelector('.resource-list');if(target&&isSessionActive())target.innerHTML=view.fileRows(list.filter(f=>domain==='submission'||f.name.toLowerCase().includes(ui.fileQuery.toLowerCase())),domain);}}catch{if(version===routeVersion){ui.fileLoading=false;render();tell('无法读取服务器文件，请稍后重试。');}}}
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
 if(ui.page==='workspace'&&ui.tab==='learn'&&ui.chatId){main.innerHTML='<section class="page"><p role="status">正在读取对话…</p></section>';const version=routeVersion;try{const detail=await api(`/api/conversations/${encodeURIComponent(ui.chatId)}/messages`);if(version!==routeVersion||!isSessionActive())return;const current=chat();if(current){current.messages=detail.messages;current.runs=detail.runs;}}catch(e){if(version!==routeVersion)return;tell(e.message);}}
 render();pollAnswers();if((ui.page==='workspace'&&ui.tab==='files')||(ui.page==='submission'&&ui.mySubmissions))await refreshFiles();
}
function download(name,body,type='text/plain;charset=utf-8'){if(!isSessionActive())return;const blob=body instanceof Blob?body:new Blob([body],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function currentFile(file){return file&&(ui.page==='submission'?file.domain==='submission':ui.page==='workspace'&&ui.tab==='files'&&file.domain==='private'&&file.subjectId===ui.subjectId);}
async function checkedFile(key){const f=ui.fileList.find(f=>f.id===key);if(!isSessionActive())throw new Error('请先登录。');if(!currentFile(f))throw new Error('文件不存在或不属于当前页面');return f;}
function validateFile(file){if(!(file instanceof File)||!file.name)throw new Error('请选择文件');if(file.size>20*1024*1024)throw new Error('单个文件最大20 MB。');}
async function downloadFile(f){const version=routeVersion;const blob=await api.blob(fileUrl(f));if(version===routeVersion)download(f.original_name??f.name,blob);}

async function openFile(f){const version=routeVersion;if(!modal(f.name,`<p class="muted">${Math.max(1,Math.ceil(f.size/1024))} KB · ${f.domain==='submission'?h(f.status):f.domain==='public'?'公共资料':'私人文件'}</p><div id="file-preview">正在读取…</div><div class="actions">${btn('下载原文件',f.domain==='public'?'public-download':'file-download',f.id,'primary')}</div>`))return;
 const target=dialog.querySelector('#file-preview');if(/^image\/(png|jpeg|gif|webp)$/.test(f.mime)||f.mime==='application/pdf'){
 try{const blob=await api.blob(fileUrl(f));if(version!==routeVersion||!isSessionActive()||!target.isConnected||!dialog.open)return;previewUrl=URL.createObjectURL(blob);if(f.mime==='application/pdf'){const frame=document.createElement('iframe');frame.src=previewUrl;frame.title=f.name;frame.className='pdf-preview';frame.setAttribute('sandbox','');target.replaceChildren(frame);}else{const image=document.createElement('img');image.src=previewUrl;image.alt=f.name;image.className='file-image';target.replaceChildren(image);}}catch(e){if(target.isConnected&&isSessionActive())target.textContent=e.message;}return;
 }if(f.domain==='submission'){target.textContent=f.note||'投稿已上传，审核结果会显示在我的投稿。';return;}
 try{const result=await api(`/api/resources/${encodeURIComponent(f.id)}/content`);if(version!==routeVersion||!target.isConnected)return;target.className='file-text';target.textContent=result.content||result.error||'暂不能预览，请下载原文件查看。';}catch(e){if(target.isConnected)target.textContent=e.message;}
}
function eventEditor(key){const e=state.agenda.find(e=>e.id===key)??{id:id(),title:'',date:dateKey(ui.date),start:'15:00',end:'15:30'};modal(key?'编辑安排':'添加安排',`<form data-form="event" data-id="${h(e.id)}" data-version="${e.version??0}"><label>安排<input name="title" maxlength="160" required value="${h(e.title)}"></label><label>日期<input type="date" name="date" required value="${e.date}"></label><div class="form-pair"><label>开始<input type="time" name="start" required value="${e.start}"></label><label>结束<input type="time" name="end" required value="${e.end}"></label></div><div class="actions"><button class="primary" type="submit">保存安排</button>${key?btn('删除安排','event-delete',key):''}${btn('取消','dialog-close')}</div></form>`);}
function plannerTexts(){modal('学科状态',`<p class="muted">独立的文本记录。不会读取学科空间，也不会随聊天或日程自动更新。</p><div class="document-list">${state.planner.texts.map(t=>`<div class="document-row"><button class="row-main" data-action="planner-text-open" data-id="${t.id}"><strong>${h(t.name)}</strong><span>${h(t.body.slice(0,60))}</span></button>${btn('打开','planner-text-open',t.id)}</div>`).join('')}</div>${btn('＋ 新建文本','planner-text-new','','outline')}`);}
function textEditor(key){const t=state.planner.texts.find(t=>t.id===key)??{id:id(),name:'',body:''};modal('编辑学科状态',`<form data-form="planner-text" data-id="${h(t.id)}" data-version="${t.version??0}"><label>学科名称<input name="name" maxlength="80" required value="${h(t.name)}"></label><label>状态文本<textarea name="body" class="text-editor" required maxlength="50000" placeholder="自然记录目标、当前情况或下一步方向…">${h(t.body)}</textarea></label><div class="actions"><button class="primary" type="submit">保存文本</button>${key?btn('下载','planner-text-download',key):''}${btn('取消','dialog-close')}</div><p class="footnote">仅在你保存时更新，不会自动修改日程。</p></form>`);}
function migrationPreview(backup){const items=importItems(backup);ui.importBackup=backup;modal('确认导入到当前账号',`<p>将导入 ${items.subjects.length} 个学科、${items.chats.length} 段学习对话、${items.documents.length} 篇学习记录、${items.agenda.length} 条待选择安排、${items.texts.length} 份规划状态、${items.plannerChats.length} 段规划对话、${items.files.length} 个文件。</p><p>聊天与文档已过滤原型示例。日程可能含原始示例，无法可靠区分只改过日期的内容，请逐条勾选要导入的安排。重复导入不会覆盖服务器内容；内容冲突会停止并保留备份。旧投稿草稿需选择真实课程，确认后送审。</p><form data-form="migration">${items.agenda.length?`<fieldset><legend>选择要导入的安排</legend>${items.agenda.map(e=>`<label><input type="checkbox" name="agenda" value="${h(e.id)}">${h(e.date)} ${h(e.start)}–${h(e.end)} · ${h(e.title)}</label>`).join('')}</fieldset>`:''}${items.files.filter(f=>f.domain==='submission').map(f=>`<label>${h(f.name)} · 投稿课程<select required name="course:${h(f.id)}"><option value="">请选择课程</option>${courses.map(c=>`<option value="${h(c.id)}">${h(c.name)}</option>`).join('')}</select></label>`).join('')}<button type="submit" class="primary">确认导入${items.files.some(f=>f.domain==='submission')?'并提交投稿':''}</button></form>`);}
function showCandidates(){modal('整理学习记录',`<p class="muted">AI 候选只在你确认保留后成为学习记录。可以修改后保留，也可以忽略。</p>${ui.candidates.map(c=>`<form data-form="candidate" data-id="${h(c.id)}"><label>标题<input name="title" required maxlength="160" value="${h(c.title)}"></label><label>内容<textarea name="body" class="text-editor" required maxlength="6000">${h(c.content)}</textarea></label><div class="actions"><button type="submit" class="primary">${c.target_memory_id?'更新这条记录':'保留到回顾'}</button>${btn('忽略','candidate-ignore',c.id)}</div></form>`).join('')||'<p>没有待确认的候选内容。</p>'}`);}
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-action]');if(!b)return;let action=b.dataset.action,key=b.dataset.id;if(b.disabled)return;b.disabled=true;captureDraft();
 if(['chat-delete','document-delete','file-delete'].includes(action)){ui.deletion={action,key,version:routeVersion};modal('确认删除',`<p>这项内容将从服务器永久删除，无法撤销。${action==='chat-delete'?'已有学习记录会保留。':''}</p><div class="actions">${btn('永久删除','confirm-delete',key,'primary')}${btn('取消','dialog-close')}</div>`);if(b.isConnected)b.disabled=false;return;}
 if(action==='confirm-delete'){const pending=ui.deletion;if(!pending||pending.version!==routeVersion){if(b.isConnected)b.disabled=false;return;}action=pending.action;key=pending.key;ui.deletion=null;}

 try{switch(action){
 case 'about':modal('关于逸学',`<p>内容保存在当前账号的服务器空间。管理员可以只读查看私人文件、聊天与学习记录，访问会被记录。</p><p>旧浏览器数据不会自动上传或删除。</p>${btn('导出旧浏览器备份','backup')}${btn('导入旧浏览器数据','import-local')}`);break;
 case 'backup':case 'import-local':{ui.migrationAction=action;const sources=browserSources();modal(action==='backup'?'导出旧浏览器备份':'导入旧浏览器数据',`<p>包括文本与文件。原浏览器内容会保留。聊天和文档示例会过滤，日程需逐条选择。</p>${sources.map(source=>btn(source===STATE_KEY?'当前账号的本机内容':'早期未分账号的本机内容','migration-source',source)).join('')||'<p>未找到旧浏览器内容。</p>'}${action==='import-local'?'<label>或选择先前导出的备份<input type="file" data-migration-backup accept="application/json,.json"></label>':''}`);break;}
 case 'migration-source':{const version=routeVersion;const backup=await readBrowserBackup(key);if(version!==routeVersion||!isSessionActive())return;if(ui.migrationAction==='backup'){download('yixue-browser-backup.json',JSON.stringify(await exportBackup(backup)),'application/json');}else migrationPreview(backup);break;}
 case 'notice-close':notice.hidden=true;break;
 case 'dialog-close':closeDialog();break;
 case 'undo':if(undo){const run=undo;await run();undo=null;notice.hidden=true;render();}break;
 case 'date-prev':case 'date-next':ui.date.setDate(ui.date.getDate()+(action==='date-next'?1:-1)*(ui.calendarMode==='week'?7:1));ui.calendarScroll=main.querySelector('.calendar-scroll').scrollTop;render();break;
 case 'date-today':ui.date=new Date();ui.calendarScroll=null;render();break;
 case 'calendar-mode':ui.calendarMode=key;ui.calendarScroll=null;render();break;
 case 'calendar-day':ui.date=new Date(key+'T12:00:00');ui.calendarMode='day';render();break;
 case 'event-new':eventEditor();break;case 'event-open':eventEditor(key);break;
 case 'event-delete':{const old=state.agenda.find(e=>e.id===key);await commit({type:'agenda.delete',id:key});closeDialog();render();tell('安排已删除',async()=>await commit({type:'agenda.save',...old}));break;}
 case 'planner-open':go('planner');break;
 case 'planner-new':{const key=await commit({type:'planner.create'});go('planner/'+key);break;}
 case 'planner-select':go('planner/'+key);break;
 case 'planner-texts':plannerTexts();break;case 'planner-text-open':textEditor(key);break;case 'planner-text-new':textEditor();break;
 case 'planner-text-download':{const t=state.planner.texts.find(t=>t.id===key);download(t.name+'-学科状态.txt',t.body);break;}
 case 'toggle-history':ui.historyOpen=!ui.historyOpen;render();break;
 case 'course':ui.course=key;ui.libraryQuery='';render();break;
 case 'public-open':await openFile(resources.find(r=>r.id===key));break;
 case 'public-download':{const r=resources.find(r=>r.id===key);await downloadFile(r);break;}
 case 'subject-new':modal('添加学科','<form data-form="subject"><label>学科名称<input name="name" required maxlength="80" placeholder="例如：操作系统"></label><div class="actions"><button class="primary" type="submit">添加</button>'+btn('取消','dialog-close')+'</div></form>');break;
 case 'chat-new':{const subjectId=ui.subjectId;const key=await commit({type:'chat.create',subjectId});go(`subjects/${encodeURIComponent(subjectId)}/learn/${key}`);break;}
 case 'chat-select':go(subjectRoute('learn',key));break;
 case 'chat-delete':{const old=state.chats.find(c=>c.id===key&&c.subjectId===ui.subjectId);await commit({type:'chat.delete',subjectId:ui.subjectId,id:key});go(subjectRoute('learn'));tell('对话已删除，已有学习记录不会被删除');break;}
 case 'candidate':{const version=routeVersion;const list=await candidatesFor(key);if(version!==routeVersion)return;ui.candidates=list.filter(c=>c.status==='pending');showCandidates();break;}
 case 'candidate-ignore':{const version=routeVersion;const c=ui.candidates.find(c=>c.id===key);await decideCandidate(c,'ignore');if(version!==routeVersion)return;ui.candidates=ui.candidates.filter(c=>c.id!==key);showCandidates();break;}
 case 'chat-retry':{const c=chat();await retryChat(c.id,c.messages.at(-1).id);await reload();render();pollAnswers();break;}
 case 'planner-retry':{const c=state.planner.chats.find(c=>c.id===ui.plannerId),m=c.messages.at(-1);try{await commit({type:'planner.send',id:c.id,content:m.content,requestId:m.requestId});}finally{await reload();render();}break;}
 case 'document-edit':ui.documentDraft=structuredClone(doc());ui.documentEditing=true;render();break;
 case 'document-cancel':ui.documentEditing=false;ui.documentDraft=null;delete ui.documentDrafts[ui.documentId];render();break;
 case 'document-download':{const d=scoped(state,ui.subjectId).documents.find(d=>d.id===key);download(d.title+'.md',`# ${d.title}\n\n${d.body}\n`,'text/markdown;charset=utf-8');break;}
 case 'document-delete':{const old=scoped(state,ui.subjectId).documents.find(d=>d.id===key);await commit({type:'document.delete',subjectId:ui.subjectId,id:key});closeDialog();if(ui.page==='document')go(subjectRoute('review'));else render();tell('学习记录已删除');break;}
 case 'file-add':main.querySelector('[data-upload=private]').click();break;
 case 'file-open':await openFile(await checkedFile(key));break;
 case 'file-download':{const f=await checkedFile(key);await downloadFile(f);break;}
 case 'file-delete':{const f=await checkedFile(key);await files.delete(f);closeDialog();await refreshFiles();tell('文件已删除');break;}
 }}catch(e){if(e.name==='AbortError')return;tell(e.message||'操作未完成，请重试。');}finally{if(b.isConnected)b.disabled=false;}
});
document.addEventListener('submit',async event=>{
 const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();const data=new FormData(form),kind=form.dataset.form,submit=form.querySelector('[type=submit]');submit.disabled=true;
 try{switch(kind){
 case 'migration':{const version=routeVersion;ui.importBackup.agendaIds=data.getAll('agenda');for(const f of ui.importBackup.files)if(f.domain==='submission')f.targetCourse=data.get('course:'+f.id);const result=await importBackup(ui.importBackup,n=>tell(`已处理 ${n} 项…`));await reload();if(version===routeVersion){closeDialog();render();}tell(`导入完成：已处理 ${result.done} 项。浏览器原数据保留。`);break;}
 case 'subject':{const key=await commit({type:'subject.create',name:data.get('name')});closeDialog();go('subjects/'+key+'/learn');break;}
 case 'event':await commit({type:'agenda.save',id:form.dataset.id,version:Number(form.dataset.version),...Object.fromEntries(data)});closeDialog();render();tell('安排已保存到服务器');break;
 case 'planner':{let key=ui.plannerId;if(!key){key=await commit({type:'planner.create'});ui.plannerId=key;}const content=data.get('content'),draft='planner:'+key;const requestId=ui.requests?.[draft]?.content===content?ui.requests[draft].id:id();ui.requests??={};ui.requests[draft]={id:requestId,content};try{await commit({type:'planner.send',id:key,content,requestId});ui.drafts[draft]='';delete ui.requests[draft];tell('回答已保存。学科状态与日程未自动修改。');}finally{await reload();render();}break;}
 case 'learning':{const subjectId=ui.subjectId;let key=ui.chatId;if(!chat()){key=await commit({type:'chat.create',subjectId});ui.chatId=key;}const content=data.get('content'),draft='chat:'+subjectId+':'+key;ui.requests??={};const requestId=ui.requests[draft]?.content===content?ui.requests[draft].id:id();ui.requests[draft]={id:requestId,content};await commit({type:'message.add',subjectId,id:key,content,requestId});ui.drafts[draft]='';delete ui.requests[draft];render();pollAnswers();tell('问题已保存，正在生成回答。');break;}
 case 'planner-text':await commit({type:'planner.text',id:form.dataset.id,version:Number(form.dataset.version),name:data.get('name'),body:data.get('body')});closeDialog();tell('文本已保存到服务器，日程没有改变');break;
 case 'document':await commit({type:'document.save',subjectId:ui.subjectId,id:ui.documentId,version:ui.documentDraft.version,title:data.get('title'),body:data.get('body')});ui.documentEditing=false;ui.documentDraft=null;delete ui.documentDrafts[ui.documentId];render();tell('学习记录已保存到服务器');break;
 case 'candidate':{const version=routeVersion,subjectId=ui.subjectId;const c=ui.candidates.find(c=>c.id===form.dataset.id);const result=await decideCandidate(c,'keep',data.get('title'),data.get('body'));await reload();if(version!==routeVersion)return;ui.candidates=ui.candidates.filter(item=>item.id!==c.id);closeDialog();go(`subjects/${encodeURIComponent(subjectId)}/review/${result.memory.id}`);tell('已保留到当前学科的回顾');break;}
 case 'submission':{const file=data.get('file');validateFile(file);await files.put({id:id(),domain:'submission',name:file.name,size:file.size,blob:file,course:data.get('course'),description:data.get('description'),createdAt:new Date().toISOString()});go('submission/mine');tell('投稿已上传，等待审核');break;}
 }}catch(e){if(e.name==='AbortError')return;tell(e.message||'保存未完成，请稍后重试。');}finally{if(submit.isConnected)submit.disabled=false;}
});
document.addEventListener('input',event=>{const el=event.target;if(el.matches('textarea[name=content]'))captureDraft();if(ui.documentEditing&&el.closest('[data-form=document]')){ui.documentDraft={...ui.documentDraft,[el.name]:el.value};}
 if(el.dataset.search){const keys={library:'libraryQuery',subject:'subjectQuery',files:'fileQuery'};ui[keys[el.dataset.search]]=el.value;const selector=el.dataset.search,position=el.selectionStart;render();const replacement=main.querySelector(`[data-search="${selector}"]`);replacement.focus();if(replacement.type!=='search')replacement.setSelectionRange(position,position);}
});
document.addEventListener('change',async event=>{const el=event.target;if(el.hasAttribute('data-migration-backup')){const version=routeVersion;try{const parsed=parseBackup(JSON.parse(await el.files[0].text()));if(version===routeVersion&&isSessionActive())migrationPreview(parsed);}catch(e){tell(e.message);}return;}if(el.dataset.filter){ui[el.dataset.filter==='type'?'resourceType':'resourceYear']=el.value;render();}
 if(el.dataset.upload==='private'){const subjectId=ui.subjectId;let saved=0;try{for(const file of el.files){validateFile(file);await files.put({id:id(),domain:'private',subjectId,name:file.name,size:file.size,blob:file,createdAt:new Date().toISOString()});saved++;}if(ui.subjectId===subjectId&&ui.tab==='files')await refreshFiles();tell(`${saved} 个文件已上传到服务器`);}catch(e){if(ui.subjectId===subjectId&&ui.tab==='files')await refreshFiles();tell(`已保存 ${saved} 个文件。${e.message||'其余文件保存失败'}`);}}
});
dialog.addEventListener('close',()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}});
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',event=>{if(isSessionActive()&&ui.documentEditing&&ui.documentDraft&&(ui.documentDraft.body!==doc()?.body||ui.documentDraft.title!==doc()?.title)){event.preventDefault();event.returnValue='';}});
window.addEventListener('storage',event=>{if(event.key===STATE_KEY)tell('另一个窗口修改了数据。请刷新后继续，避免覆盖。');});
try{await reload();}catch(e){loadError=e;}
route();pollAnswers();
