import {id} from './api.js';
import {$,$$,el,button,link,note,empty,field,form,selectField,modal,closeModal,bytes,formatDate,perform} from './ui.js';
import {richText} from './render.js';
const extractionLabels={pending:'正在读取',ready:'可作为参考',partial:'部分内容已读取',failed:'内容读取失败',unsupported:'仅支持下载',needs_vision:'需要图像识别服务'};
export class Resources {
  constructor(app){this.app=app;this.tab='public';this.courseId='';this.query='';this.epoch=0;
    $$('[data-library-tab]').forEach(node=>node.addEventListener('click',()=>perform(node,async()=>{this.tab=node.dataset.libraryTab;this.courseId='';await this.renderLibrary();})));
    let timer;$('[data-library-search]').addEventListener('input',event=>{this.query=event.target.value;clearTimeout(timer);timer=setTimeout(()=>perform(null,()=>this.renderLibrary()),250);});
  }
  reset(){this.tab='public';this.courseId='';this.query='';this.epoch++;$('[data-library-content]').replaceChildren();$('[data-files-panel]').replaceChildren();$('[data-references]').replaceChildren();$('[data-library-search]').value='';}
  get api(){return this.app.api;}
  async courses(){return (await this.api('/api/courses')).courses;}
  async renderLibrary(){
    const epoch=++this.epoch;const target=$('[data-library-content]');target.replaceChildren(note('正在读取资料…'));
    $$('[data-library-tab]').forEach(node=>node.classList.toggle('active',node.dataset.libraryTab===this.tab));
    const panel=el('div');
    try{
      if(this.tab==='public')await this.publicPanel(panel);else if(this.tab==='private')await this.privatePanel(panel);else await this.submissionPanel(panel,this.tab==='moderation');
      if(epoch===this.epoch)target.replaceChildren(panel);
    }catch(error){if(epoch===this.epoch)target.replaceChildren(note(error.message),button('重试',()=>this.renderLibrary()));throw error;}
  }
  async publicPanel(panel){
    const courses=await this.courses();const head=el('div','library-section-head');head.append(el('h2','','公共资料'),note('按实际课程组织，由管理员审核收录。'));panel.append(head);
    if(this.app.state.user.role==='admin')head.append(button('添加课程',()=>modal('添加课程',form([field('实际课程名称',{name:'name',required:true,maxLength:256})],'添加课程',async values=>{await this.api('/api/courses',{method:'POST',body:{name:values.get('name').trim()}});closeModal();await this.renderLibrary();})),'text-link'));
    const courseList=el('div','library-course-list');
    for(const course of courses.filter(item=>!this.query||item.name.toLowerCase().includes(this.query.toLowerCase()))){const entry=button('',async()=>{this.courseId=course.id;await this.renderLibrary();},'library-course-card');entry.append(el('strong','',course.name),el('span','','›'));entry.setAttribute('aria-current',String(this.courseId===course.id));courseList.append(entry);}
    if(!courses.length)courseList.append(empty('还没有公共课程。'));panel.append(courseList);
    const params=new URLSearchParams({scope:'public'});if(this.courseId)params.set('courseId',this.courseId);if(this.query)params.set('q',this.query);
    const {resources}=await this.api(`/api/resources?${params}`);
    panel.append(el('h3','',courses.find(course=>course.id===this.courseId)?.name||'公共资料'),this.resourceList(resources));
    if(this.courseId)panel.append(button('查看全部课程资料',async()=>{this.courseId='';await this.renderLibrary();},'text-link'));
  }
  async privatePanel(panel,subjectId){
    const head=el('div','library-section-head');head.append(el('h2','','私人资料'),note('资料归你所有；只有主动选择后才会用于对话。'),button('上传资料',()=>this.upload(subjectId),'r1-button'));panel.append(head);
    const params=new URLSearchParams({scope:'private'});if(subjectId)params.set('subjectId',subjectId);if(this.query&&!subjectId)params.set('q',this.query);
    const {resources}=await this.api(`/api/resources?${params}`);panel.append(this.resourceList(resources));
  }
  async renderSubjectFiles(){const subjectId=this.app.state.subject?.id;if(!subjectId)return;const target=$('[data-files-panel]');target.replaceChildren(note('正在读取资料…'));try{const panel=el('div','feature-panel');await this.privatePanel(panel,subjectId);if(this.app.state.subject?.id===subjectId)target.replaceChildren(panel);}catch(error){target.replaceChildren(note(error.message),button('重试',()=>this.renderSubjectFiles()));throw error;}}
  resourceList(resources){
    const list=el('div','resource-list');if(!resources.length){list.append(empty('还没有资料。'));return list;}
    for(const resource of resources){const row=el('article','resource-row');const details=el('div');details.append(button(resource.name,()=>this.detail(resource),'resource-name'),note(`${bytes(resource.size)} · ${extractionLabels[resource.extraction_status]||'正在读取'}${resource.page_count?` · ${resource.page_count} 页`:''}`));
      const actions=el('div','toolbar-actions');actions.append(link('下载',`/api/resources/${id(resource.id)}/download`));if(this.app.state.conversation)actions.append(button('参考',()=>this.referenceDetail(resource),'text-link'));row.append(details,actions);list.append(row);}
    return list;
  }
  upload(subjectId){
    const input=field('选择文件（最大 20 MB）',{name:'file',type:'file',required:true});
    const subjects=[['','不关联学科'],...this.app.state.subjects.map(subject=>[subject.id,subject.name])];
    const uploadForm=form([input,field('显示名称（可留空）',{name:'name',maxLength:256}),selectField('关联学科','subjectId',subjects,subjectId)],'上传私人资料',async values=>{
      const file=values.get('file');if(file.size>20*1024*1024)throw new Error('文件超过 20 MB，请选择较小的文件。');if(!values.get('subjectId'))values.delete('subjectId');if(!values.get('name'))values.delete('name');
      await this.api('/api/resources',{method:'POST',body:values});closeModal();await this.refresh();this.app.notify('资料已上传。内容读取结果会显示在资料详情中。');
    });const panel=el('div');panel.append(note('支持 PDF、文本、Markdown、代码、Word、PowerPoint 和图片。ZIP 仅下载使用。'),uploadForm);modal('上传私人资料',panel);
  }
  async refresh(){if(this.app.state.tab==='files'&&this.app.state.subject)await this.renderSubjectFiles();if($('#library-view').classList.contains('active'))await this.renderLibrary();if(this.app.state.conversation)await this.renderReferences();}
  async detail(resource){
    const panel=el('div');panel.append(note(`${resource.original_name} · ${bytes(resource.size)} · ${formatDate(resource.created_at)}`),note(extractionLabels[resource.extraction_status]||'内容读取状态未知'));
    if(resource.extraction_error)panel.append(el('p','form-error',resource.extraction_error));
    const actions=el('div','toolbar-actions');actions.append(link('下载原文件',`/api/resources/${id(resource.id)}/download`));if(this.app.state.conversation)actions.append(button('设为当前对话参考',()=>this.referenceDetail(resource)));
    if(!['ready','unsupported'].includes(resource.extraction_status))actions.append(button('重新读取',()=>{
      const fields=resource.mime==='application/pdf'?[field('起始页（可留空）',{name:'startPage',type:'number'}),field('结束页（最多选择 20 页）',{name:'endPage',type:'number'})]:[];
      const retry=form(fields,'读取所选内容',async values=>{const {resource:next}=await this.api(`/api/resources/${id(resource.id)}/extract`,{method:'POST',body:{startPage:values.get('startPage')?Number(values.get('startPage')):undefined,endPage:values.get('endPage')?Number(values.get('endPage')):undefined}});await this.detail(next);await this.refresh();});
      const box=el('div');box.append(note('扫描页和图片需要已配置的图像识别服务。读取失败的内容不会用于 AI 回答。'),retry);modal(`读取 · ${resource.name}`,box);
    }));panel.append(actions);
    if(resource.scope==='private')panel.append(form([field('显示名称',{name:'name',value:resource.name,required:true,maxLength:256}),selectField('关联学科','subjectId',[['','不关联学科'],...this.app.state.subjects.map(subject=>[subject.id,subject.name])],resource.subject_id||'')],'保存资料信息',async values=>{const {resource:next}=await this.api(`/api/resources/${id(resource.id)}`,{method:'PATCH',body:{name:values.get('name').trim(),subjectId:values.get('subjectId')||null}});await this.detail(next);await this.refresh();}));
    if(resource.scope==='private'||this.app.state.user.role==='admin')panel.append(button('删除资料',()=>this.deleteResource(resource),'text-link danger'));
    const content=el('div','resource-content');if(['ready','partial'].includes(resource.extraction_status)){content.append(note('正在读取已提取内容…'));panel.append(content);modal(resource.name,panel);try{const result=await this.api(`/api/resources/${id(resource.id)}/content`);content.replaceChildren(el('h3','','已读取内容'),richText(result.content));if(result.truncated)content.append(note('内容较长，这里仅显示部分。'));if(result.error)content.append(note(result.error));}catch(error){content.replaceChildren(note(error.message));}}
    else modal(resource.name,panel);
  }
  deleteResource(resource){const panel=el('div');panel.append(note('删除后，文件和已读取内容将移除，之后无法再用于对话。已有回答会保留，并标记参考不可用。'),button('删除这份资料',async()=>{await this.api(`/api/resources/${id(resource.id)}`,{method:'DELETE'});closeModal();await this.refresh();},'r1-button danger'));modal(`删除 ${resource.name}`,panel);}
  async renderReferences(){
    const conversationId=this.app.state.conversation?.id;const target=$('[data-references]');const previous=target.querySelector('[data-memory-references]');target.replaceChildren();if(!conversationId)return;
    const {references}=await this.api(`/api/conversations/${id(conversationId)}/references`);if(this.app.state.conversation?.id!==conversationId)return;
    const toggle=button(references.length?`本次参考 · ${references.length}`:'选择本次参考',()=>this.pickReferences(),'text-link');target.append(toggle);
    for(const reference of references){target.append(el('span','reference-chip',`${reference.name}${reference.available?'':' · 已不可用'}${reference.available&&!['ready','partial'].includes(reference.extraction_status)?' · 未读取':''}${reference.start_page?` · ${reference.start_page}–${reference.end_page||reference.start_page}页`:''}`));}
    if(previous)target.append(previous);
  }
  async referenceDetail(resource){
    const conversation=this.app.state.conversation;if(!conversation)throw new Error('请先选择一个学习对话。');
    const fields=[];if(resource.page_count){fields.push(field('起始页（可留空，使用全部已读取内容）',{name:'startPage',type:'number'}),field('结束页（可留空）',{name:'endPage',type:'number'}));}
    const panel=el('div');panel.append(note(`仅用于「${conversation.title}」，新对话不会继承。`),note(extractionLabels[resource.extraction_status]||'尚未读取'));
    panel.append(form(fields,'添加本次参考',async values=>{const {references}=await this.api(`/api/conversations/${id(conversation.id)}/references`);const next=references.filter(value=>value.available&&value.resource_id!==resource.id).map(value=>({resourceId:value.resource_id,startPage:value.start_page||undefined,endPage:value.end_page||undefined}));next.push({resourceId:resource.id,startPage:values.get('startPage')?Number(values.get('startPage')):undefined,endPage:values.get('endPage')?Number(values.get('endPage')):undefined});await this.api(`/api/conversations/${id(conversation.id)}/references`,{method:'PUT',body:{references:next}});closeModal();await this.renderReferences();}));modal(`参考 · ${resource.name}`,panel);
  }
  async pickReferences(){
    const conversation=this.app.state.conversation;if(!conversation)return;
    const [{resources:privateResources},{resources:publicResources},{references}]=await Promise.all([this.api('/api/resources?scope=private'),this.api('/api/resources?scope=public'),this.api(`/api/conversations/${id(conversation.id)}/references`)]);
    const selected=new Map(references.filter(item=>item.available).map(item=>[item.resource_id,item]));const fields=[];
    for(const [heading,resources] of [['私人资料',privateResources],['公共资料',publicResources]]){fields.push(el('h3','',heading));if(!resources.length)fields.push(empty('还没有资料。'));for(const resource of resources){const wrapper=el('label','selection-row');const input=el('input');input.type='checkbox';input.name='resourceId';input.value=resource.id;input.checked=selected.has(resource.id);wrapper.append(input,el('span','',`${resource.name} · ${extractionLabels[resource.extraction_status]||'未读取'}`));fields.push(wrapper);}}
    const panel=el('div');panel.append(note('只使用你明确选择且成功读取的资料。取消勾选后，后续回答不再使用。'),form(fields,'保存本次参考',async values=>{const next=values.getAll('resourceId').map(resourceId=>({resourceId,startPage:selected.get(resourceId)?.start_page||undefined,endPage:selected.get(resourceId)?.end_page||undefined}));await this.api(`/api/conversations/${id(conversation.id)}/references`,{method:'PUT',body:{references:next}});closeModal();await this.renderReferences();}));modal('本次参考',panel);
  }
  async submissionPanel(panel,admin){
    const courses=await this.courses();panel.append(el('h2','',admin?'投稿审核':'我要投稿'),note('投稿是一份独立资料；审核通过后生成独立的公共资料。'));
    if(!admin){if(courses.length)panel.append(button('选择文件投稿',()=>modal('提交资料',form([field('选择文件（最大 20 MB）',{name:'file',type:'file',required:true}),field('显示名称（可留空）',{name:'name',maxLength:256}),selectField('所属课程','courseId',courses.map(course=>[course.id,course.name]))],'提交投稿',async values=>{if(values.get('file').size>20*1024*1024)throw new Error('文件超过 20 MB。');if(!values.get('name'))values.delete('name');await this.api('/api/submissions',{method:'POST',body:values});closeModal();await this.renderLibrary();}))));else panel.append(empty('管理员添加课程后即可投稿。'));}
    const {submissions}=await this.api('/api/submissions');const list=el('div','resource-list');
    for(const submission of submissions.filter(item=>!this.query||item.name.toLowerCase().includes(this.query.toLowerCase()))){const row=el('article','resource-row');const detail=el('div');detail.append(el('strong','',submission.name),note(`${courses.find(course=>course.id===submission.course_id)?.name||'课程'} · ${{pending:'待审核',accepted:'已收录',rejected:'未收录'}[submission.status]}${submission.note?` · ${submission.note}`:''}`));const actions=el('div','toolbar-actions');actions.append(link('下载',`/api/submissions/${id(submission.id)}/download`));if(admin&&submission.status==='pending'){actions.append(button('审核',()=>{const review=el('div');const noteField=field('审核说明（可留空）',{name:'note',rows:3});review.append(note(`收录会为「${courses.find(course=>course.id===submission.course_id)?.name||'此课程'}」创建独立公共资料。`),noteField);for(const [decision,label] of [['accept','收录'],['reject','不收录']])review.append(button(label,async()=>{await this.api(`/api/submissions/${id(submission.id)}/review`,{method:'POST',body:{decision,note:$('textarea',noteField).value}});closeModal();await this.renderLibrary();}));modal(`审核 · ${submission.name}`,review);}));}row.append(detail,actions);list.append(row);}
    if(!submissions.length)list.append(empty(admin?'目前没有待审核投稿。':'你还没有投稿。'));panel.append(list);
  }
}
