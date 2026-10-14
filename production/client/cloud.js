import {api,id as enc} from './api.js';
export const emptyState=()=>({version:2,subjects:[],chats:[],documents:[],agenda:[],planner:{chats:[],texts:[]}});
const post=(path,body)=>api(path,{method:'POST',body});
export function mapMemory(m){return {...m,subjectId:m.subject_space_id,body:m.content,sourceId:m.sources?.[0]?.id,updatedAt:m.updated_at};}
export function mapFile(f,domain){return {...f,domain,subjectId:f.subject_id,course:f.course_id,type:f.type??f.resource_type??'',year:String(f.year??''),createdAt:f.created_at};}
export async function loadCloud({chatId}={}){
 const [ss,pp,cc,rr]=await Promise.all([api('/api/subjects'),api('/api/planner'),api('/api/courses'),api('/api/resources?scope=public')]);
 const state=emptyState();state.subjects=ss.subjects;
 for(const r of pp.records){if(r.kind==='agenda')state.agenda.push(r);if(r.kind==='text')state.planner.texts.push({...r,name:r.title,body:r.content});if(r.kind==='chat')state.planner.chats.push(r);}
 await Promise.all(state.subjects.map(async s=>{const [cs,ms]=await Promise.all([api(`/api/subjects/${enc(s.id)}/conversations`),api(`/api/subjects/${enc(s.id)}/memories`)]);state.documents.push(...ms.memories.map(mapMemory));const chats=await Promise.all(cs.conversations.map(async c=>{const detail=c.id===chatId?await api(`/api/conversations/${enc(c.id)}/messages`):{messages:[],runs:[]};return {...c,subjectId:s.id,messages:detail.messages,runs:detail.runs};}));state.chats.push(...chats);}));
 return {state,courses:cc.courses,resources:rr.resources.map(f=>mapFile(f,'public'))};
}
export async function mutate(state,a){
 const planner=state.planner,record=[...state.agenda,...planner.texts,...planner.chats].find(r=>r.id===a.id);
 switch(a.type){
 case 'subject.create':return (await post('/api/subjects',{name:a.name})).subject.id;
 case 'chat.create':return (await post(`/api/subjects/${enc(a.subjectId)}/conversations`,{})).conversation.id;
 case 'chat.delete':return api(`/api/conversations/${enc(a.id)}`,{method:'DELETE'});
 case 'message.add':return post(`/api/conversations/${enc(a.id)}/messages`,{content:a.content,requestId:a.requestId});
 case 'planner.create':return (await post('/api/planner/records',{kind:'chat',title:'新对话'})).record.id;
 case 'planner.send':return post(`/api/planner/chats/${enc(a.id)}/messages`,{content:a.content,requestId:a.requestId});
 case 'agenda.save':case 'planner.text':{const body=a.type==='agenda.save'?{kind:'agenda',title:a.title,date:a.date,start:a.start,end:a.end}:{kind:'text',title:a.name,content:a.body};return record?api(`/api/planner/records/${enc(a.id)}`,{method:'PATCH',body:{...body,version:a.version??record.version}}):post('/api/planner/records',body);}
 case 'agenda.delete':case 'planner.delete':return api(`/api/planner/records/${enc(a.id)}`,{method:'DELETE'});
 case 'document.delete':return api(`/api/memories/${enc(a.id)}`,{method:'DELETE'});
 case 'document.save':{const old=state.documents.find(d=>d.id===a.id&&d.subjectId===a.subjectId);if(!old)throw new Error('记录不存在，请重新打开。');return api(`/api/memories/${enc(a.id)}`,{method:'PATCH',body:{title:a.title,content:a.body,version:a.version??old.version}});}
 default:throw new Error('不支持此操作。');
 }
}
export const cloudFiles={
 async list(domain,subjectId){const result=await api(domain==='submission'?'/api/submissions':`/api/resources?scope=private&subjectId=${enc(subjectId)}`);return (result.submissions??result.resources).map(f=>mapFile(f,domain));},
 async put(f){const body=new FormData();body.set('file',f.blob,f.name);if(f.subjectId)body.set('subjectId',f.subjectId);if(f.course)body.set('courseId',f.course);if(f.description)body.set('description',f.description);return api(f.domain==='submission'?'/api/submissions':'/api/resources',{method:'POST',body});},
 async delete(f){return api(`/api/${f.domain==='submission'?'submissions':'resources'}/${enc(f.id)}`,{method:'DELETE'});},
};
export const fileUrl=f=>`/api/${f.domain==='submission'?'submissions':'resources'}/${enc(f.id)}/download`;
export const candidatesFor=async chatId=>(await post(`/api/conversations/${enc(chatId)}/candidates`,{})).candidates;
export const decideCandidate=(candidate,action,title,body)=>post(`/api/candidates/${enc(candidate.id)}/decision`,{action,title,content:body,version:candidate.target_memory_version,targetMemoryId:candidate.target_memory_id});
export const retryChat=(chatId,messageId)=>post(`/api/conversations/${enc(chatId)}/retry`,{messageId});
// A running answer needs one selected-conversation request per tick, independent of library size.
export function createAnswerPoller({getCurrent,onUpdate,onError,request=api,schedule=setTimeout,cancel=clearTimeout,delay=1600}){
 let timer,generation=0;
 const same=(a,b)=>!!b?.active&&a.id===b.id&&a.subjectId===b.subjectId&&a.routeVersion===b.routeVersion;
 function stop(){generation++;cancel(timer);}
 function refresh(){
  stop();const selected=getCurrent();if(!selected?.active||!selected.runs?.some(r=>['queued','running'].includes(r.status)))return;
  const token=generation;
  timer=schedule(async()=>{
   if(token!==generation||!same(selected,getCurrent()))return;
   try{const detail=await request(`/api/conversations/${enc(selected.id)}/messages`);if(token!==generation||!same(selected,getCurrent()))return;onUpdate(detail,selected);refresh();}
   catch(error){if(token===generation&&same(selected,getCurrent())&&error.name!=='AbortError')onError(error);}
  },delay);
 }
 return {refresh,stop};
}
