import {id} from './api.js';
import {$,el,button,note,empty,field,form,selectField,modal,closeModal,formatDate,perform} from './ui.js';
import {richText} from './render.js';
export class Continuity {
  constructor(app){this.app=app;this.reset();}
  reset(){this.advice=[];this.arrangements=new Map();this.date=new Date();this.stateSubjectId=null;this.stateEpoch=0;this.reviewEpoch=0;const thread=$('[data-advice-thread]');if(thread)thread.replaceChildren();const arrangement=$('[data-arrangement]');if(arrangement){arrangement.replaceChildren();arrangement.hidden=true;}if($('[data-advice-input]'))$('[data-advice-input]').value='';}
  get api(){return this.app.api;}
  dateKey(){return `${this.date.getFullYear()}-${String(this.date.getMonth()+1).padStart(2,'0')}-${String(this.date.getDate()).padStart(2,'0')}`;}
  renderHome(){
    const strip=$('[data-date-strip]');strip.replaceChildren();const today=new Date();today.setHours(0,0,0,0);
    const arrow=(delta,label)=>{const node=button(delta<0?'‹':'›',()=>{this.date.setDate(this.date.getDate()+delta);this.renderHome();},'small-arrow');node.setAttribute('aria-label',label);return node;};strip.append(arrow(-1,'前一天'));
    for(let offset=-3;offset<=3;offset++){const date=new Date(this.date);date.setDate(date.getDate()+offset);date.setHours(0,0,0,0);const node=button('',()=>{this.date=date;this.renderHome();},`date-card${offset===0?' active':''}`);node.append(el('strong','',String(date.getDate())),el('span','',date.valueOf()===today.valueOf()?'今天':['日','一','二','三','四','五','六'][date.getDay()]));node.setAttribute('aria-label',`${date.getMonth()+1}月${date.getDate()}日`);node.setAttribute('aria-pressed',String(offset===0));strip.append(node);}strip.append(arrow(1,'后一天'));
    const thread=$('[data-advice-thread]');thread.replaceChildren();for(const item of this.advice){const user=el('div','r1-user-message',item.input);const assistant=el('div','r1-assistant-message');assistant.append(note(`${item.date} 的行动建议`),richText(item.advice),button('采用为本次安排',()=>{this.arrangements.set(item.date,item.advice);this.date=new Date(`${item.date}T12:00:00`);this.renderHome();},'r1-button'));thread.append(user,assistant);}
    const arrangement=$('[data-arrangement]');arrangement.replaceChildren();const current=this.arrangements.get(this.dateKey());arrangement.hidden=!current;
    if(current){arrangement.append(el('h2','','本次安排'),richText(current),button('调整安排',()=>modal('调整本次安排',form([field('安排',{name:'content',rows:7,value:current,required:true})],'采用调整',async values=>{this.arrangements.set(this.dateKey(),values.get('content'));closeModal();this.renderHome();})),'text-link'),button('移除安排',()=>{this.arrangements.delete(this.dateKey());this.renderHome();},'text-link'));}
  }
  async askAdvice(){
    const input=$('[data-advice-input]');const content=input.value.trim();if(!content)return;const date=this.dateKey();
    const pending=note('正在结合现状生成建议…');$('[data-advice-thread]').append(pending);
    try{const {advice}=await this.api('/api/action-advice',{method:'POST',body:{input:`我选择的安排日期是 ${date}。\n${content}`}});this.advice.push({input:content,advice,date});input.value='';this.renderHome();}finally{pending.remove();}
  }
  async openState(subjectId){
    await this.app.refreshSubjects();this.stateSubjectId=subjectId||this.stateSubjectId||this.app.state.subjects[0]?.id;
    const list=$('[data-state-subjects]');list.replaceChildren();
    for(const subject of this.app.state.subjects){const node=button(subject.name,async()=>{this.stateSubjectId=subject.id;await this.openState(subject.id);},'state-subject-option');node.setAttribute('aria-current',String(subject.id===this.stateSubjectId));list.append(node);}
    const dialog=$('[data-state-dialog]');if(!dialog.open)dialog.showModal();
    if(!this.stateSubjectId){$('[data-state-editor]').replaceChildren(empty('先添加一个学科，再记录它的当前现状。'));return;}
    await this.renderState();
  }
  async renderState(){
    const subjectId=this.stateSubjectId;const epoch=++this.stateEpoch;const target=$('[data-state-editor]');target.replaceChildren(note('正在读取现状…'));
    try{const {state}=await this.api(`/api/subjects/${id(subjectId)}/state`);if(epoch!==this.stateEpoch||subjectId!==this.stateSubjectId||!$('[data-state-dialog]').open)return;
      const subject=this.app.state.subjects.find(value=>value.id===subjectId);target.replaceChildren(el('h3','',subject?.name||'学科現状'));
      target.append(state.content?el('p','state-current-text',state.content):empty('还没有整理现状。可以直接记录，或把新的变化交给 AI 整理。'));
      if(state.updated_at)target.append(note(`更新于 ${formatDate(state.updated_at)}`));
      target.append(button('直接编辑',()=>this.editState(subjectId,state)));
      target.append(form([field('最近有什么变化？',{name:'input',rows:4,required:true,placeholder:'提供仍会影响后续行动判断的信息…'})],'请 AI 整理',async values=>{const proposal=await this.api(`/api/subjects/${id(subjectId)}/state/preview`,{method:'POST',body:{input:values.get('input')}});if(epoch!==this.stateEpoch||subjectId!==this.stateSubjectId||!$('[data-state-dialog]').open)return;this.stateProposal(subjectId,proposal);}),note('只有你点击保存或采用后，现状才会更新。'));
    }catch(error){if(epoch===this.stateEpoch)target.replaceChildren(note(error.message),button('重试',()=>this.renderState()));throw error;}
  }
  editState(subjectId,state){
    this.stateEpoch++;
    const target=$('[data-state-editor]');target.replaceChildren(el('h3','','编辑学科现状'),form([field('当前最小充分现状',{name:'content',rows:10,value:state.content})],'保存现状',async values=>{await this.api(`/api/subjects/${id(subjectId)}/state`,{method:'PUT',body:{content:values.get('content'),version:state.version}});await this.renderState();}),button('取消编辑',()=>this.renderState(),'text-link'));
  }
  stateProposal(subjectId,proposal){
    const target=$('[data-state-editor]');target.replaceChildren(el('h3','','整理建议'),note('请检查建议内容；你可以修改后采用。'),form([field('建议现状',{name:'content',rows:10,value:proposal.content})],'采用为学科现状',async values=>{await this.api(`/api/subjects/${id(subjectId)}/state`,{method:'PUT',body:{content:values.get('content'),version:proposal.version}});await this.renderState();}),button('放弃建议',()=>this.renderState(),'text-link'));
  }
  async renderReview(){
    const subjectId=this.app.state.subject?.id;if(!subjectId)return;const epoch=++this.reviewEpoch;const target=$('[data-review-panel]');target.replaceChildren(note('正在读取回顾…'));
    const panel=el('div','review-tools');const heading=el('div','library-section-head');heading.append(el('h2','','回顾'),button('开始回顾',()=>this.newReview()),button('学习记忆',()=>this.memories(),'text-link'));panel.append(heading);
    const reviews=this.app.state.conversations.filter(value=>value.kind==='review');const current=this.app.state.conversation?.kind==='review'?this.app.state.conversation:null;
    if(!current){panel.append(note('主动选择本学科的原始学习对话，围绕它们回顾、追问。学习记忆只在你明确保留后产生。'));if(!reviews.length)panel.append(empty('还没有回顾对话。'));for(const review of reviews)panel.append(button(review.title,()=>{location.hash=`/subjects/${id(subjectId)}/${id(review.id)}`;},'r1-conversation-entry'));}
    else {
      const [{sources},{candidates}]=await Promise.all([this.api(`/api/reviews/${id(current.id)}/sources`),this.api(`/api/reviews/${id(current.id)}/candidates`)]);
      const row=el('div','review-source-bar');row.append(note(`回顾来源：${sources.map(source=>`${source.title}${source.available?'':'（不可用）'}`).join('、')||'没有可用来源'}`),button('修改来源',()=>this.editReviewSources(current,sources),'text-link'));panel.append(row);
      const details=el('details','candidate-section');details.append(el('summary','',`学习记忆候选 · ${candidates.filter(value=>value.status==='pending').length}`));
      details.append(note('只保留未来仍会影响学习的信息；无需为了完整而保存。'),button('提取记忆候选',async()=>{await this.api(`/api/reviews/${id(current.id)}/candidates`,{method:'POST',body:{}});await this.renderReview();}));
      for(const candidate of candidates){const item=el('article','candidate-row');item.append(el('strong','',candidate.title),el('p','',candidate.content));if(candidate.status==='pending'){item.append(button('编辑并保留',()=>this.keepCandidate(candidate)),button('忽略',async()=>{await this.api(`/api/candidates/${id(candidate.id)}/decision`,{method:'POST',body:{action:'ignore'}});await this.renderReview();},'text-link'));}else item.append(note(candidate.status==='kept'?'已保留为学习记忆':'已忽略'));details.append(item);}panel.append(details);
    }
    if(epoch===this.reviewEpoch&&this.app.state.subject?.id===subjectId)target.replaceChildren(panel);
  }
  sourceFields(selected=[]){
    const conversations=this.app.state.conversations.filter(value=>value.kind!=='review');const fields=[];
    if(!conversations.length)fields.push(empty('本学科还没有原始学习对话。先带着具体问题开始学习。'));
    for(const conversation of conversations){const label=el('label','selection-row');const input=el('input');input.type='checkbox';input.name='sourceId';input.value=conversation.id;input.checked=selected.includes(conversation.id);label.append(input,el('span','',conversation.title));fields.push(label);}return fields;
  }
  newReview(selected=[]){
    const subjectId=this.app.state.subject.id;const requestId=crypto.randomUUID();const fields=this.sourceFields(selected);fields.push(field('想重点回顾什么？（可留空）',{name:'focus',rows:3}));
    const panel=el('div');panel.append(note('可选择原始对话作为证据；不选择来源时，AI 只帮你明确回顾方向。'),form(fields,'开始回顾',async values=>{const sourceIds=values.getAll('sourceId');const result=await this.api(`/api/subjects/${id(subjectId)}/reviews`,{method:'POST',body:{sourceIds,focus:values.get('focus'),requestId}});closeModal();await this.app.refreshConversations();location.hash=`/subjects/${id(subjectId)}/${id(result.conversation.id)}`;if(result.warning)this.app.notify(`${result.warning.message} 回顾已保存，可以在对话中重试回答。`);}));modal('选择回顾来源',panel);
  }
  editReviewSources(review,sources){
    const panel=el('div');panel.append(note('来源变化只用于之后的回答，不改写已有回顾。'),form(this.sourceFields(sources.filter(value=>value.available).map(value=>value.id)),'保存回顾来源',async values=>{const sourceIds=values.getAll('sourceId');await this.api(`/api/reviews/${id(review.id)}/sources`,{method:'PUT',body:{sourceIds}});closeModal();await this.renderReview();}));modal('修改回顾来源',panel);
  }
  async memories(){
    const {memories}=await this.api(`/api/subjects/${id(this.app.state.subject.id)}/memories`);const panel=el('div');panel.append(note('待推进的记忆会按相关性用于后续学习。已形成认识的记忆可由你主动选择使用。'));
    for(const memory of memories){const item=el('article','memory-row');item.append(el('h3','',memory.title),el('p','',memory.content),note(memory.status==='active'?'待推进 · Active':'已形成认识 · Inactive'));
      const actions=el('div','toolbar-actions');actions.append(button('编辑',()=>this.editMemory(memory),'text-link'),button('来源',()=>this.memorySources(memory),'text-link'));
      if(this.app.state.conversation)actions.append(button('用于当前对话',async()=>{const path=`/api/conversations/${id(this.app.state.conversation.id)}/memory-references`;const selected=(await this.api(path)).memories;await this.api(path,{method:'PUT',body:{memoryIds:[...new Set([...selected.map(value=>value.id),memory.id])]}});await this.renderMemoryReferences();this.app.notify('已选择这条记忆用于当前对话。');},'text-link'));
      item.append(actions);panel.append(item);
    }
    if(!memories.length)panel.append(empty('还没有确认保留的学习记忆。'));modal('学习记忆',panel);
  }
  async renderMemoryReferences(){
    const conversationId=this.app.state.conversation?.id;if(!conversationId)return;const {memories}=await this.api(`/api/conversations/${id(conversationId)}/memory-references`);if(this.app.state.conversation?.id!==conversationId)return;
    const target=$('[data-references]');target.querySelector('[data-memory-references]')?.remove();const row=el('div','memory-reference-strip');row.dataset.memoryReferences='';
    for(const memory of memories){const chip=el('span','reference-chip');chip.append(document.createTextNode(`记忆 · ${memory.title}`),button('×',async()=>{await this.api(`/api/conversations/${id(conversationId)}/memory-references`,{method:'PUT',body:{memoryIds:memories.filter(value=>value.id!==memory.id).map(value=>value.id)}});await this.renderMemoryReferences();},'text-link'));row.append(chip);}target.append(row);
  }
  editMemory(memory){
    const fields=[field('学习点',{name:'title',value:memory.title,required:true,maxLength:256}),field('当前最小充分内容',{name:'content',rows:7,value:memory.content,required:true}),selectField('状态','status',[['active','待推进 · Active'],['inactive','已形成认识 · Inactive']],memory.status)];
    const panel=el('div');panel.append(form(fields,'保存记忆',async values=>{await this.api(`/api/memories/${id(memory.id)}`,{method:'PATCH',body:{...Object.fromEntries(values),version:memory.version}});await this.memories();}),button('删除记忆',()=>{const confirm=el('div');confirm.append(note('删除后，这条记忆不再用于后续学习。原始学习对话不会因此删除。'),button('删除这条记忆',async()=>{await this.api(`/api/memories/${id(memory.id)}`,{method:'DELETE'});await this.memories();await this.renderMemoryReferences();},'r1-button danger'));modal('删除学习记忆',confirm);},'text-link danger'));modal('编辑学习记忆',panel);
  }
  async memorySources(memory){
    const {sources}=await this.api(`/api/memories/${id(memory.id)}/sources`);const panel=el('div');
    for(const source of sources){if(source.available)panel.append(button(source.title,()=>{closeModal();location.hash=`/subjects/${id(this.app.state.subject.id)}/${id(source.id)}`;},'r1-conversation-entry'));else panel.append(note(`${source.title} · 原始来源已不可用`));}if(!sources.length)panel.append(empty('没有可访问来源。'));modal('记忆来源',panel);
  }
  async keepCandidate(candidate){
    const {memories}=await this.api(`/api/subjects/${id(this.app.state.subject.id)}/memories`);
    const fields=[field('学习点',{name:'title',value:candidate.title,required:true,maxLength:256}),field('值得继续保留的内容',{name:'content',rows:7,value:candidate.content,required:true}),selectField('保留方式','targetMemoryId',[['','创建新学习点'],...memories.map(memory=>[memory.id,`更新已有学习点：${memory.title}`])],candidate.target_memory_id||'')];
    const panel=el('div');panel.append(note('同一个学习点应更新已有记忆。检查内容后再保留。'),note(`候选状态：${candidate.suggested_status==='active'?'待推进 · Active':'已形成认识 · Inactive'}。保留后仍可编辑状态。`),form(fields,'确认保留',async values=>{const targetMemoryId=values.get('targetMemoryId')||null;const version=targetMemoryId?memories.find(memory=>memory.id===targetMemoryId)?.version:undefined;await this.api(`/api/candidates/${id(candidate.id)}/decision`,{method:'POST',body:{action:'keep',title:values.get('title'),content:values.get('content'),targetMemoryId,version}});closeModal();await this.renderReview();}));modal('保留学习记忆',panel);
  }
}
