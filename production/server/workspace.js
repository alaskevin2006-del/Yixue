import {randomUUID,createHash} from 'node:crypto';
import {HttpError} from './errors.js';
import {handleResources} from './resources.js';
const fail=(code,message)=>{throw new HttpError(409,code,message);};
const txt=(v,max=50000)=>{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))throw new HttpError(400,'INVALID_IMPORT','导入内容无效或过长。');return v;};
export function initWorkspace(store){store.db.exec('CREATE TABLE IF NOT EXISTS browser_imports (owner_id TEXT NOT NULL, source_key TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(owner_id,source_key,kind)) STRICT;');}
const fileLocks=new WeakMap();
export async function handleWorkspace(ctx){
 const {path,method,store,principal}=ctx;if(!path.startsWith('/api/workspace/import'))return null;
 if(!principal)throw new HttpError(401,'AUTH_REQUIRED','请登录');
 const reply=body=>({status:200,body}),owner=principal.id;
 const file=path.match(/^\/api\/workspace\/import\/files\/([^/]+)$/);
 if(file&&method==='POST'){
  const key=decodeURIComponent(file[1]);txt(key,512);let locks=fileLocks.get(store);if(!locks){locks=new Set();fileLocks.set(store,locks);}const lock=owner+':'+key;if(locks.has(lock))fail('IMPORT_BUSY','该文件正在导入，请稍后重试。');locks.add(lock);
  try{const old=store.get("SELECT * FROM browser_imports WHERE owner_id=? AND source_key=? AND kind='file'",owner,key);if(old)return reply({id:old.target_id,replayed:true});
   // Files remain in the resource domain; its upload limits, ownership and storage checks apply.
   const result=await handleResources({...ctx,importSourceKey:key,path:ctx.url?.searchParams.get('domain')==='submission'?'/api/submissions':'/api/resources'});const id=(result.body.resource??result.body.submission).id;
   return reply({id});
  }finally{locks.delete(lock);}
 }
 if(path!=='/api/workspace/import'||method!=='POST')return null;
 const b=await ctx.body();const key=txt(b.key,512),kind=txt(b.kind,32),data=b.data;if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'INVALID_IMPORT','导入对象无效。');
 const digest=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 return store.transaction(()=>{
  const old=store.get('SELECT * FROM browser_imports WHERE owner_id=? AND source_key=? AND kind=?',owner,key,kind);
  if(old){if(old.digest!==digest)fail('IMPORT_CHANGED','这项本机内容已导入且后来发生变化；请下载备份并手动合并，避免覆盖服务器内容。');return reply({id:old.target_id,replayed:true});}
  const id=randomUUID(),at=new Date().toISOString();
  const subject=()=>{const row=store.get('SELECT id FROM subjects WHERE id=? AND owner_user_id=?',txt(data.subjectId,128),owner);if(!row)throw new HttpError(404,'NOT_FOUND','目标学科不存在。');return row.id;};
  if(kind==='subject')store.run('INSERT INTO subjects (id,owner_user_id,name,icon,created_at,updated_at) VALUES (?,?,?,?,?,?)',id,owner,txt(data.name,100),'book',at,at);
  else if(kind==='chat')store.run('INSERT INTO conversations (id,subject_space_id,title,kind,created_at,updated_at) VALUES (?,?,?,?,?,?)',id,subject(),txt(data.title,200),'learning',at,at);
  else if(kind==='message'){
   const chat=store.get('SELECT c.id FROM conversations c JOIN subjects s ON s.id=c.subject_space_id WHERE c.id=? AND s.owner_user_id=? AND c.deleted_at IS NULL',txt(data.chatId,128),owner);if(!chat)throw new HttpError(404,'NOT_FOUND','目标对话不存在。');if(!['user','assistant'].includes(data.role))throw new HttpError(400,'INVALID_ROLE','消息角色无效');
   const ordinal=store.get('SELECT COALESCE(MAX(ordinal),0)+1 n FROM messages WHERE conversation_id=?',chat.id).n;store.run('INSERT INTO messages VALUES (?,?,?,?,?,?)',id,chat.id,data.role,txt(data.content,50000),ordinal,at);
  }else if(kind==='document'){
   const sid=subject(),title=txt(data.title,160),content=txt(data.body,50000);store.run('INSERT INTO learning_memories VALUES (?,?,?,?,?,?,1,?,?)',id,sid,title,content,'active',content.slice(0,180),at,at);
   if(data.sourceId&&store.get('SELECT id FROM conversations WHERE id=? AND subject_space_id=? AND deleted_at IS NULL',data.sourceId,sid))store.run('INSERT INTO memory_sources VALUES (?,?)',id,data.sourceId);
  }else if(kind==='planner-message'){
   const row=store.get("SELECT * FROM planner_records WHERE id=? AND owner_id=? AND kind='chat'",txt(data.chatId,128),owner);if(!row)throw new HttpError(404,'NOT_FOUND','规划对话不存在');if(!['user','assistant'].includes(data.role))throw new HttpError(400,'INVALID_ROLE','消息角色无效');const chat=JSON.parse(row.data);if(chat.messages.length>=1000)fail('CHAT_LIMIT','规划消息已达上限');chat.messages.push({role:data.role,content:txt(data.content,50000),requestId:id});store.run('UPDATE planner_records SET data=?,version=version+1,updated_at=? WHERE id=?',JSON.stringify(chat),at,row.id);
  }else if(['agenda','text','planner-chat'].includes(kind)){
   let record;if(kind==='agenda'){if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.end)||data.end<=data.start||!Number.isFinite(new Date(data.date+'T12:00:00Z').valueOf())||new Date(data.date+'T12:00:00Z').toISOString().slice(0,10)!==data.date)throw new HttpError(400,'INVALID_SCHEDULE','日期或时间无效');record={title:txt(data.title,160),date:data.date,start:data.start,end:data.end};}
   if(kind==='text')record={title:txt(data.name,160),content:txt(data.body,50000)};
   if(kind==='planner-chat'){if(!Array.isArray(data.messages)||data.messages.length>1000)throw new HttpError(400,'INVALID_IMPORT','规划消息无效');record={title:txt(data.title,160),messages:data.messages.map(m=>{if(!['user','assistant'].includes(m.role))throw new HttpError(400,'INVALID_ROLE','消息角色无效');return {role:m.role,content:txt(m.content,50000),requestId:randomUUID()};})};}
   store.run('INSERT INTO planner_records VALUES (?,?,?,?,1,?)',id,owner,kind==='planner-chat'?'chat':kind,JSON.stringify(record),at);
  }else throw new HttpError(400,'INVALID_IMPORT','不支持的导入类型');
  store.run('INSERT INTO browser_imports VALUES (?,?,?,?,?)',owner,key,kind,id,digest);return reply({id});
 });
}
