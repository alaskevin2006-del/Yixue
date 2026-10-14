import {api as request,id} from './client/api.js';
import {createMessageSender,waitForRun} from './client/workflows.js';
import {$,$$,el,button,note,empty,field,form,selectField,modal,closeModal,perform,setErrorHandler,formatDate,show} from './client/ui.js';
import {richText} from './client/render.js';
import {Resources} from './client/resources.js';
import {Continuity} from './client/continuity.js';
import {Planner} from './client/planner.js';

const state={user:null,subjects:[],subject:null,conversations:[],conversation:null,messages:[],tab:'learn',query:'',busy:false,epoch:0,sessionEpoch:0,poll:null};
async function api(path,options){const sessionEpoch=state.sessionEpoch;try{const result=await request(path,options);if(sessionEpoch!==state.sessionEpoch)throw new DOMException('账户已变化','AbortError');return result;}catch(error){if(sessionEpoch!==state.sessionEpoch)throw new DOMException('账户已变化','AbortError');throw error;}}
const sendMessage=createMessageSender(api);
const app={state,api,openConversation,openSubject,refreshSubjects,refreshConversations,setTab,loadMessages,showError,notify};
const resources=new Resources(app); const continuity=new Continuity(app);const planner=new Planner(app);

function showError(error){
  if(error.status===401){endSession('登录已过期，请重新登录。');return;}
  const box=$('[data-global-status]');$('span',box).textContent=error.message || '连接失败，请重试。';box.hidden=false;
}
function notify(message){const box=$('[data-global-status]');$('span',box).textContent=message;box.hidden=false;}
setErrorHandler(showError);
function endSession(message=''){
  request.resetSession();
  sendMessage.reset();
  state.poll?.abort();state.epoch++;state.sessionEpoch++;state.user=null;state.subject=null;state.conversation=null;state.subjects=[];state.conversations=[];state.messages=[];state.query='';state.busy=false;$('[data-subject-search]').value='';$('[data-message-input]').value='';
  show('[data-app]',false);show('[data-auth]',true);$('[data-login]').reset();$('[data-login-error]').textContent=message;$('[data-boot-status]').textContent='';
  for(const dialog of $$('dialog'))dialog.close();continuity.reset();resources.reset();planner.reset();
}
async function startSession(user){
  state.sessionEpoch++;state.user=user;show('[data-auth]',false);show('[data-app]',true);show('[data-global-status]',false);
  $('[data-account]').textContent=user.username.slice(0,1);$('[data-account]').title=`${user.username} · 账户`;
  await refreshSubjects();await route();
}
function navigate(path){if(location.hash===`#${path}`)perform(null,route);else location.hash=path;}
function view(name){
  $$('.view').forEach(node=>node.classList.toggle('active',node.id===`${name}-view`));
  $$('[data-view-link]').forEach(node=>node.classList.toggle('active',node.dataset.viewLink===name));
}
async function route(){
  if(!state.user)return;const [,root,subjectId,conversationId]=location.hash.replace(/^#/,'').split('/');
  if(root==='planner'){view('planner');await planner.renderChat();return;}
  if(root==='library'){view('library');await resources.renderLibrary();return;}
  if(root==='subjects'){view('subjects');if(subjectId)await openSubject(decodeURIComponent(subjectId),conversationId?decodeURIComponent(conversationId):null);else {state.poll?.abort();state.subject=null;state.conversation=null;show('[data-subject-index]',true);show('[data-subject-workspace]',false);await refreshSubjects();}return;}
  view('home');await planner.renderHome();
}
async function refreshSubjects(){const {subjects}=await api('/api/subjects');state.subjects=subjects;renderSubjects();return subjects;}
function renderSubjects(){
  const list=$('[data-subject-list]');list.replaceChildren();
  const subjects=state.subjects.filter(subject=>subject.name.toLowerCase().includes(state.query.toLowerCase()));
  if(!subjects.length){list.append(empty(state.subjects.length?'没有找到这个学科。':'添加一个学科，带着真实学习问题开始。'));return;}
  for(const subject of subjects){const item=el('div','r1-subject-item');const entry=button('',()=>navigate(`/subjects/${id(subject.id)}`),'r1-subject-entry');entry.append(el('span','r1-subject-icon',iconSymbol(subject.icon)),el('strong','r1-subject-name',subject.name));item.append(entry);const customize=button('···',()=>editSubject(subject),'r1-icon-customize');customize.setAttribute('aria-label',`编辑 ${subject.name}`);item.append(customize);list.append(item);}
}
function iconSymbol(icon){return {book:'📘',math:'📐',tree:'🌿',science:'🧪',code:'💻',folder:'📚'}[icon]||icon||'📘';}
function createSubject(){modal('添加学科',form([field('学科名称',{name:'name',required:true,maxLength:256})],'创建学科',async values=>{const {subject}=await api('/api/subjects',{method:'POST',body:{name:values.get('name').trim()}});closeModal();await refreshSubjects();navigate(`/subjects/${id(subject.id)}`);}));}
function editSubject(subject){
  const content=el('div');const icons=['📘','📐','🌿','🧪','💻','🌍','📚','🎨','∑'];
  const symbol=iconSymbol(subject.icon);if(!icons.includes(symbol))icons.unshift(symbol);
  const edit=form([field('学科名称',{name:'name',value:subject.name,required:true,maxLength:100}),selectField('图标','icon',icons.map(icon=>[icon,icon]),symbol)],'保存',async values=>{await api(`/api/subjects/${id(subject.id)}`,{method:'PATCH',body:{name:values.get('name').trim(),icon:values.get('icon')}});closeModal();await refreshSubjects();if(state.subject?.id===subject.id){state.subject=state.subjects.find(value=>value.id===subject.id);$('[data-current-subject]').textContent=state.subject.name;}});content.append(edit);modal('编辑学科',content);
}
async function refreshConversations(){if(!state.subject)return;const subjectId=state.subject.id;const {conversations}=await api(`/api/subjects/${id(subjectId)}/conversations`);if(state.subject?.id!==subjectId)return;state.conversations=conversations;const current=conversations.find(item=>item.id===state.conversation?.id);if(current){state.conversation.title=current.title;$('[data-current-conversation]').textContent=current.title;}renderConversations();return conversations;}
function renderConversations(){
  const list=$('[data-conversation-list]');list.replaceChildren();
  if(!state.conversations.length){list.append(empty('还没有对话。'));return;}
  for(const conversation of state.conversations){const entry=button('',()=>navigate(`/subjects/${id(state.subject.id)}/${id(conversation.id)}`),'r1-conversation-entry');entry.setAttribute('aria-current',String(state.conversation?.id===conversation.id));entry.append(el('strong','',`${conversation.kind==='review'?'回顾 · ':''}${conversation.title}`),el('time','',formatDate(conversation.updated_at||conversation.created_at)));list.append(entry);}
}
async function openSubject(subjectId,conversationId=null){
  const subject=state.subjects.find(item=>item.id===subjectId);if(!subject){showError(new Error('这个学科不存在或你没有访问权限。'));navigate('/subjects');return;}
  const changed=state.subject?.id!==subjectId;state.subject=subject;show('[data-subject-index]',false);show('[data-subject-workspace]',true);$('[data-current-subject]').textContent=subject.name;$('[data-new-conversation]').textContent='+ '+subject.name+' 新对话';
  if(changed){state.poll?.abort();state.epoch++;state.conversation=null;state.messages=[];state.tab='learn';await refreshConversations();}
  if(conversationId)await openConversation(conversationId);else if(changed||state.conversation){state.conversation=null;state.messages=[];state.tab='learn';renderChat();}
  await setTab(state.tab);setNavigation(false);
}
async function openConversation(conversationId){
  state.poll?.abort();const epoch=++state.epoch;
  $('[data-messages]').replaceChildren(note('正在读取对话…'));setSendEnabled(false);
  const [{conversation}, messageData]=await Promise.all([api(`/api/conversations/${id(conversationId)}`),api(`/api/conversations/${id(conversationId)}/messages`)]);
  if(epoch!==state.epoch)return;
  if(conversation.subject_space_id!==state.subject.id)throw new Error('对话不属于当前学科。');
  state.conversation=conversation;state.messages=messageData.messages;state.tab='learn';state.busy=false;renderChat();renderConversations();await resources.renderReferences();
  await continuity.renderMemoryReferences();
  const run=conversation.latest_run || messageData.run || messageData.runs?.at(-1);
  if(run&&['queued','running'].includes(run.status))perform(null,()=>trackRun(run));
  else if(run?.status==='failed')renderRunFailure(run);
  else if(!run&&conversation.kind==='review'&&state.messages.at(-1)?.role==='user')renderRunFailure({},new Error('回顾回答尚未完成，可以重试。'));
}
async function loadMessages(conversationId=state.conversation?.id){
  if(!conversationId)return;const {messages}=await api(`/api/conversations/${id(conversationId)}/messages`);if(state.conversation?.id===conversationId){state.messages=messages;renderMessages();}
}
function renderMessages(){
  const container=$('[data-messages]');const nearBottom=container.scrollHeight-container.scrollTop-container.clientHeight<100;
  container.replaceChildren();
  if(!state.messages.length){container.append(empty(state.conversation?'把你现在遇到的问题带到这里。':'选择已有对话，或新建一次学习对话。'));}
  for(const message of state.messages){const article=el('article',message.role==='user'?'r1-user-message':'r1-assistant-message');article.dataset.messageId=message.id;if(message.role==='user')article.textContent=message.content;else article.append(richText(message.content));container.append(article);}
  if(nearBottom||state.busy)container.scrollTop=container.scrollHeight;
}
function setSendEnabled(enabled){$('[data-message-input]').disabled=!enabled;$('[data-send-message]').disabled=!enabled;}
function renderChat(){
  const conversation=state.conversation;$('[data-current-conversation]').textContent=conversation?.title || '选择或新建对话';$('[data-message-target]').textContent=conversation?`${conversation.kind==='review'?'回顾对话':'学习对话'} · ${state.subject.name}`:'';
  $('[data-delete-conversation]').disabled=!conversation||state.busy;show('[data-review-current]',!!conversation);setSendEnabled(!!conversation&&!state.busy);
  $('[data-run-status]').replaceChildren();$('[data-save-status]').textContent='';if(!conversation)$('[data-references]').replaceChildren();renderMessages();
}
async function setTab(tab){
  state.tab=tab;$$('[data-subject-tab]').forEach(node=>node.classList.toggle('active',node.dataset.subjectTab===tab));
  show('[data-files-panel]',tab==='files');show('[data-review-panel]',tab==='review');show('[data-chat-panel]',tab==='learn');
  $('[data-workspace-shell]').classList.toggle('auxiliary-open',tab!=='learn');
  if(tab==='files')await resources.renderSubjectFiles();if(tab==='review')await continuity.renderReview();
}
function setNavigation(open){show('[data-conversation-nav]',open);show('[data-nav-scrim]',open&&innerWidth<=700);$('[data-workspace-shell]').classList.toggle('nav-collapsed',!open);$('[data-nav-toggle]').setAttribute('aria-expanded',String(open));}
async function newConversation(){const {conversation}=await api(`/api/subjects/${id(state.subject.id)}/conversations`,{method:'POST',body:{}});await refreshConversations();navigate(`/subjects/${id(state.subject.id)}/${id(conversation.id)}`);}
async function trackRun(run){
  const conversationId=state.conversation?.id;const controller=new AbortController();state.poll?.abort();state.poll=controller;state.busy=true;setSendEnabled(false);$('[data-delete-conversation]').disabled=true;
  try{
    await waitForRun(api,run.id,{signal:controller.signal,onProgress:()=>{$('[data-run-status]').textContent='AI 正在回答…';}});
    if(state.conversation?.id===conversationId){await loadMessages(conversationId);$('[data-run-status]').textContent='';await refreshConversations();}
  }catch(error){if(error.name!=='AbortError'&&state.conversation?.id===conversationId){renderRunFailure(error.run||run,error);}}
  finally{if(state.poll===controller){state.busy=false;state.poll=null;setSendEnabled(!!state.conversation);$('[data-delete-conversation]').disabled=!state.conversation;}}
}
function renderRunFailure(run,error){
  const box=$('[data-run-status]');box.replaceChildren(el('span','',error?.message||run.error_message||'AI 回答未完成。'));
  box.append(button('重试回答',async()=>{const messageId=run.user_message_id||run.message_id||[...state.messages].reverse().find(item=>item.role==='user')?.id;const {run:next}=await api(`/api/conversations/${id(state.conversation.id)}/retry`,{method:'POST',body:{messageId}});await trackRun(next);},'text-link'));
}
async function submitMessage(){
  if(!state.conversation||state.busy)return;const input=$('[data-message-input]');const content=input.value;if(!content.trim())return;
  const conversationId=state.conversation.id;state.busy=true;setSendEnabled(false);$('[data-save-status]').textContent='正在发送…';
  try{const result=await sendMessage(conversationId,content);if(state.conversation?.id!==conversationId)return;input.value='';$('[data-save-status]').textContent='已保存';await loadMessages();await refreshConversations();if(result.run)await trackRun(result.run);}
  catch(error){$('[data-save-status]').textContent=`${error.message} 原问题仍保留，可再次发送。`;showError(error);}
  finally{state.busy=false;setSendEnabled(!!state.conversation);}
}
function deleteConversation(){
  const conversation=state.conversation;if(!conversation)return;const content=el('div');content.append(note('删除后将无法再访问原始对话。已经确认的学习记忆会保留，并显示来源不可用。'),button('删除这次对话',async()=>{await api(`/api/conversations/${id(conversation.id)}`,{method:'DELETE'});closeModal();state.poll?.abort();state.conversation=null;state.messages=[];await refreshConversations();navigate(`/subjects/${id(state.subject.id)}`);},'r1-button danger'));modal('删除对话',content);
}
function account(){
  const panel=el('div','account-panel');panel.append(note(`当前账户：${state.user.username}`));
  panel.append(form([field('当前密码',{name:'currentPassword',type:'password',required:true}),field('新密码（至少 10 位）',{name:'newPassword',type:'password',required:true})],'修改密码',async values=>{await api('/api/auth/password',{method:'POST',body:Object.fromEntries(values)});closeModal();endSession('密码已修改，请重新登录。');}));
  if(state.user.role==='admin')panel.append(button('账户管理',adminAccounts),button('投稿审核',async()=>{closeModal();resources.tab='moderation';navigate('/library');}));
  panel.append(button('退出登录',async()=>{await api('/api/auth/logout',{method:'POST'});endSession();}));modal('账户',panel);
}
async function adminAccounts(){
  const panel=el('div');panel.append(el('h3','','开通账户'),form([field('用户名',{name:'username',required:true,maxLength:64}),field('初始密码（至少 10 位）',{name:'password',type:'password',required:true}),selectField('权限','role',[['user','用户'],['admin','管理员']])],'开通账户',async values=>{await api('/api/admin/users',{method:'POST',body:Object.fromEntries(values)});await adminAccounts();}));
  const {users}=await api('/api/admin/users');panel.append(el('h3','','已有账户'));
  for(const user of users){
    const row=el('div','account-row');
    row.append(el('span','',`${user.username} · ${user.role==='admin'?'管理员':'用户'}${user.disabled?' · 已停用':''}`),button('重置密码',()=>modal(`重置 ${user.username} 的密码`,form([field('新密码（至少 10 位）',{name:'password',type:'password',required:true})],'重置密码',async values=>{await api(`/api/admin/users/${id(user.id)}/password`,{method:'POST',body:{password:values.get('password')}});if(user.id===state.user.id){endSession('密码已重置，请重新登录。');}else await adminAccounts();})),'text-link'));
    if(user.id!==state.user.id)row.append(button(user.disabled?'启用账户':'停用账户',async()=>{await api(`/api/admin/users/${id(user.id)}`,{method:'PATCH',body:{disabled:!user.disabled}});await adminAccounts();},'text-link'));
    panel.append(row);
  }modal('账户管理',panel);
}

$$('[data-view-link]').forEach(node=>node.addEventListener('click',event=>{event.preventDefault();navigate(`/${node.dataset.viewLink}`);}));
$('[data-login]').addEventListener('submit',event=>{event.preventDefault();perform($('button',event.currentTarget),async()=>{const credentials=Object.fromEntries(new FormData(event.currentTarget));const {user}=await api('/api/auth/login',{method:'POST',body:credentials});await startSession(user);},error=>$('[data-login-error]').textContent=error.message);});
$('[data-add-subject]').addEventListener('click',createSubject);$('[data-subject-search]').addEventListener('input',event=>{state.query=event.target.value;renderSubjects();});
$('[data-subject-home]').addEventListener('click',()=>navigate('/subjects'));
$('[data-new-conversation]').addEventListener('click',event=>perform(event.currentTarget,newConversation));
$('[data-nav-toggle]').addEventListener('click',()=>setNavigation($('[data-conversation-nav]').hidden));$('[data-nav-close]').addEventListener('click',()=>setNavigation(false));$('[data-nav-scrim]').addEventListener('click',()=>setNavigation(false));
$$('[data-subject-tab]').forEach(node=>node.addEventListener('click',()=>perform(node,()=>setTab(node.dataset.subjectTab))));
$('[data-message-form]').addEventListener('submit',event=>{event.preventDefault();submitMessage();});
$('[data-delete-conversation]').addEventListener('click',deleteConversation);$('[data-review-current]').addEventListener('click',()=>perform(null,()=>continuity.candidates()));
$('[data-account]').addEventListener('click',account);$('[data-modal-close]').addEventListener('click',closeModal);$('[data-dismiss-error]').addEventListener('click',()=>show('[data-global-status]',false));
window.addEventListener('hashchange',()=>perform(null,route));
document.addEventListener('keydown',event=>{if(event.key==='Escape')setNavigation(false);});
async function boot(){try{const {user}=await api('/api/auth/me');await startSession(user);}catch(error){if(error.name==='AbortError')return;if(error.status===401)endSession();else {$('[data-boot-status]').replaceChildren(note('连接暂时失败。'),button('重新连接',boot));$('[data-login-error]').textContent=error.message;}}}
boot();
