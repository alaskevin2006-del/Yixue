import {api} from './api.js';
import {STATE_KEY,fileDatabaseName} from './storage.js';
import {createInitialState} from './model.js';
export function browserSources(){return [...new Set([STATE_KEY,'yixue-user-prototype-v2'])].filter(key=>localStorage.getItem(key)!==null);}
async function readFiles(name){if(indexedDB.databases&&!(await indexedDB.databases()).some(d=>d.name===name))return [];return new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('files')){db.close();resolve([]);return;}const tx=db.transaction('files','readonly'),r=tx.objectStore('files').getAll();r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);};request.onerror=()=>reject(request.error);});}
export async function readBrowserBackup(key){if(!browserSources().includes(key))throw new Error('本机数据不存在');const state=JSON.parse(localStorage.getItem(key));if(state.version!==2)throw new Error('不支持的本机版本');const files=await readFiles(key===STATE_KEY?fileDatabaseName():'yixue-prototype-files');return {format:'yixue-browser-export-v1',source:key,state,files};}
export async function exportBackup(backup){return {...backup,files:await Promise.all(backup.files.map(async f=>{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(f.blob);});return {...f,blob:undefined,data};}))};}
export function parseBackup(value){if(value?.format!=='yixue-browser-export-v1'||!value.state||!Array.isArray(value.files)||typeof value.source!=='string')throw new Error('备份格式无效');return {...value,files:value.files.map(f=>{if(typeof f.data!=='string'||!/^data:[^,]*;base64,/.test(f.data))throw new Error('备份文件无效');const [header,body]=f.data.split(',');const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));return {...f,blob:new Blob([bytes],{type:header.slice(5).split(';')[0]})};})};}
export function importItems(backup){const s=backup.state,initial=createInitialState();for(const list of ['subjects','chats','documents','agenda'])if(!Array.isArray(s[list]))throw new Error('备份内容无效');if(!Array.isArray(s.planner?.texts)||!Array.isArray(s.planner?.chats))throw new Error('规划备份无效');
 const changed=(x,list,fields)=>{const old=list.find(i=>i.id===x.id);return !old||fields.some(k=>x[k]!==old[k]);};
 const chats=s.chats.map(c=>{const initialChat=initial.chats.find(x=>x.id===c.id);return {...c,messages:c.messages.filter((m,i)=>!m.sample&&!(initialChat?.messages[i]?.content===m.content&&initialChat.messages[i].role===m.role))};}).filter(c=>c.messages.length);
 const documents=s.documents.filter(d=>changed(d,initial.documents,['title','body']));
 // Seed creation date was not recorded. Preserve every agenda entry for explicit selection.
 const agenda=s.agenda.filter(e=>backup.agendaIds===undefined||backup.agendaIds.includes(e.id));
 const texts=s.planner.texts.filter(t=>changed(t,initial.planner.texts,['name','body']));
 const plannerChats=s.planner.chats.map(c=>({...c,messages:c.messages.filter((m,i)=>!m.sample&&initial.planner.chats.find(x=>x.id===c.id)?.messages[i]?.content!==m.content)})).filter(c=>c.messages.length);
 const needed=new Set([...chats,...documents,...backup.files].map(x=>x.subjectId));const subjects=s.subjects.filter(s=>needed.has(s.id)||!initial.subjects.some(i=>i.id===s.id&&i.name===s.name));
 return {subjects,chats,documents,agenda,texts,plannerChats,files:backup.files};
}
export async function importBackup(backup,onProgress=()=>{}){const items=importItems(backup),subjectIds=new Map(),chatIds=new Map();let done=0;
 const put=async(kind,key,data)=>{const r=await api('/api/workspace/import',{method:'POST',body:{kind,key:backup.source+':'+key,data}});onProgress(++done);return r.id;};
 for(const s of items.subjects)subjectIds.set(s.id,await put('subject',s.id,{name:s.name}));
 for(const c of items.chats){const chatId=await put('chat',c.id,{subjectId:subjectIds.get(c.subjectId),title:c.title});chatIds.set(c.id,chatId);for(let i=0;i<c.messages.length;i++)await put('message',c.id+':'+i,{chatId,role:c.messages[i].role,content:c.messages[i].content});}
 for(const d of items.documents)await put('document',d.id,{subjectId:subjectIds.get(d.subjectId),title:d.title,body:d.body,...(chatIds.has(d.sourceId)?{sourceId:chatIds.get(d.sourceId)}:{})});
 for(const e of items.agenda)await put('agenda',e.id,{title:e.title,date:e.date,start:e.start,end:e.end});
 for(const t of items.texts)await put('text',t.id,{name:t.name,body:t.body});
 for(const c of items.plannerChats){const chatId=await put('planner-chat',c.id,{title:c.title,messages:[]});for(let i=0;i<c.messages.length;i++)await put('planner-message',c.id+':'+i,{chatId,role:c.messages[i].role,content:c.messages[i].content});}
 for(const f of items.files){const body=new FormData();body.set('file',f.blob,f.name);if(subjectIds.has(f.subjectId))body.set('subjectId',subjectIds.get(f.subjectId));if(f.domain==='submission'){if(!f.targetCourse)throw new Error('请选择投稿课程');body.set('courseId',f.targetCourse);if(f.description)body.set('description',f.description);}await api('/api/workspace/import/files/'+encodeURIComponent(backup.source+':'+f.id)+(f.domain==='submission'?'?domain=submission':''),{method:'POST',body});onProgress(++done);}
 return {done,submissionDrafts:items.files.filter(f=>f.domain==='submission').length};
}
