import {randomUUID} from 'node:crypto';
import {HttpError} from './errors.js';
import {initAudit,audit} from './audit.js';
import {readUpload,saveFile,removeFile,safeFile} from './resource-files.js';
import {extractResource} from './resource-extract.js';
import {insertResource,storeExtraction} from './resources.js';
import {withUploadQuota} from './quota.js';
export function initAdmin(store){initAudit(store);}
const result=body=>({status:200,body});
const fail=(status,code,message)=>{throw new HttpError(status,code,message);};
const label=value=>{if(typeof value!=='string'||!value.trim()||value.trim().length>200||/[\x00-\x1f]/.test(value))fail(400,'INVALID_NAME','名称须为1至200个字符');return value.trim();};
const view=({storage_key,...row})=>row;
export async function handleAdmin(ctx){
 const {path,method,store,principal:user,config={}}=ctx;
 if(!path.startsWith('/api/admin/'))return null;
 if(!user)fail(401,'AUTH_REQUIRED','请先登录');
 if(user.role!=='admin')fail(403,'ADMIN_REQUIRED','此操作需要管理员权限');
 if(path==='/api/admin/audit'&&method==='GET')return result({events:store.all('SELECT a.*,u.username AS actor FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 500')});
 const inspect=path.match(/^\/api\/admin\/users\/([^/]+)\/content$/);
 if(inspect){
  if(method!=='GET')fail(405,'READ_ONLY','用户内容仅供只读检查');
  const id=inspect[1],account=store.get('SELECT id,username,disabled,role FROM users WHERE id=?',id);if(!account)fail(404,'NOT_FOUND','账号不存在');
  const subjects=store.all('SELECT * FROM subjects WHERE owner_user_id=?',id);
  const conversations=store.all('SELECT c.* FROM conversations c JOIN subjects s ON c.subject_space_id=s.id WHERE s.owner_user_id=? AND c.deleted_at IS NULL',id);
  const messages=store.all('SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN subjects s ON s.id=c.subject_space_id WHERE s.owner_user_id=? AND c.deleted_at IS NULL ORDER BY m.conversation_id,m.ordinal',id);
  const has=name=>!!store.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?",name);
  const memories=has('learning_memories')?store.all('SELECT m.* FROM learning_memories m JOIN subjects s ON s.id=m.subject_space_id WHERE s.owner_user_id=?',id):[];
  const states=has('subject_states')?store.all('SELECT m.* FROM subject_states m JOIN subjects s ON s.id=m.subject_space_id WHERE s.owner_user_id=?',id):[];
  const planner=has('planner_records')?store.all('SELECT * FROM planner_records WHERE owner_id=?',id):[];
  const resources=store.all("SELECT * FROM resources WHERE owner_user_id=? AND scope='private' AND deleted_at IS NULL",id).map(view);
  audit(store,user,'private.read','user',id);return result({readOnly:true,user:account,subjects,conversations,messages,memories,states,planner,resources});
 }
 const privateFile=path.match(/^\/api\/admin\/users\/([^/]+)\/resources\/([^/]+)\/(content|download)$/);
 if(privateFile){
  if(method!=='GET')fail(405,'READ_ONLY','私人资料仅供只读检查');
  const [,owner,id,action]=privateFile;const row=store.get("SELECT * FROM resources WHERE id=? AND owner_user_id=? AND scope='private' AND deleted_at IS NULL",id,owner);if(!row)fail(404,'NOT_FOUND','资料不存在');
  if(action==='download'){const file={path:safeFile(config,row.storage_key),name:row.original_name,mime:row.mime,inline:false};audit(store,user,'private.download','resource',id);return{status:200,file};}
  audit(store,user,'private.read','resource',id);return result({resource:view(row),pages:store.all('SELECT page,content FROM resource_pages WHERE resource_id=? ORDER BY page',id)});
 }
 const course=path.match(/^\/api\/admin\/courses\/([^/]+)$/);
 if(course){
  const id=course[1];if(!store.get('SELECT id FROM resource_courses WHERE id=?',id))fail(404,'NOT_FOUND','课程不存在');
  if(method==='PATCH'){const name=label((await ctx.body()).name);if(store.get('SELECT id FROM resource_courses WHERE name=? AND id<>?',name,id))fail(409,'NAME_EXISTS','课程名称已存在');store.transaction(()=>{store.run('UPDATE resource_courses SET name=? WHERE id=?',name,id);audit(store,user,'course.update','course',id);});return result({course:store.get('SELECT * FROM resource_courses WHERE id=?',id)});}
  if(method==='DELETE'){if(store.get('SELECT id FROM resources WHERE course_id=? UNION ALL SELECT id FROM resource_submissions WHERE course_id=? LIMIT 1',id,id))fail(409,'COURSE_IN_USE','课程仍有关联资料或投稿');store.transaction(()=>{store.run('DELETE FROM resource_courses WHERE id=?',id);audit(store,user,'course.delete','course',id);});return{status:204};}
 }
 if(path==='/api/admin/resources'){
  if(method==='GET')return result({resources:store.all("SELECT * FROM resources WHERE scope='public' ORDER BY created_at DESC").map(view)});
  if(method==='POST'){
   const upload=await readUpload(ctx.req,config),courseId=upload.fields.courseId;if(!store.get('SELECT id FROM resource_courses WHERE id=?',courseId||''))fail(400,'INVALID_COURSE','请选择已有课程');
   return withUploadQuota(store,config,user,upload.size,async()=>{
   const name=label(upload.fields.name||upload.originalName),key=await saveFile(config,upload.bytes);
   const row={id:randomUUID(),scope:'public',owner_user_id:null,subject_id:null,course_id:courseId,name,original_name:upload.originalName,mime:upload.mime,size:upload.size,storage_key:key,created_at:new Date().toISOString()};
   try{store.transaction(()=>{insertResource(store,row);audit(store,user,'public.upload','resource',row.id);});}catch(e){await removeFile(config,key);throw e;}
   storeExtraction(store,row.id,await extractResource(row,config,ctx.ai));return{status:201,body:{resource:view(store.get('SELECT * FROM resources WHERE id=?',row.id))}};
   });
  }
 }
 const resource=path.match(/^\/api\/admin\/resources\/([^/]+)(?:\/(archive|restore|download))?$/);
 if(resource){
  const [,id,action]=resource,row=store.get("SELECT * FROM resources WHERE id=? AND scope='public'",id);if(!row)fail(404,'NOT_FOUND','公共资料不存在');
  if(action==='download'&&method==='GET'){const file={path:safeFile(config,row.storage_key),name:row.original_name,mime:row.mime,inline:false};audit(store,user,'public.download','resource',id);return {status:200,file};}
  if(['archive','restore'].includes(action)&&method==='POST'){
   if(action==='restore')safeFile(config,row.storage_key);
   store.transaction(()=>{store.run('UPDATE resources SET archived_at=?,updated_at=? WHERE id=?',action==='archive'?new Date().toISOString():null,new Date().toISOString(),id);audit(store,user,`public.${action}`,'resource',id);});return result({resource:view(store.get('SELECT * FROM resources WHERE id=?',id))});
  }
  if(!action&&method==='PATCH'){
   const body=await ctx.body(),name=label(body.name??row.name),courseId=body.courseId??row.course_id;
   if(typeof courseId!=='string'||!store.get('SELECT id FROM resource_courses WHERE id=?',courseId))fail(400,'INVALID_COURSE','请选择已有课程');
   store.transaction(()=>{store.run('UPDATE resources SET name=?,course_id=?,updated_at=? WHERE id=?',name,courseId,new Date().toISOString(),id);store.run('UPDATE public_resources SET course_id=? WHERE resource_id=?',courseId,id);audit(store,user,'public.update','resource',id);});return result({resource:view(store.get('SELECT * FROM resources WHERE id=?',id))});
  }
 }
 // Account routes are owned by authentication; do not intercept them.
 if(/^\/api\/admin\/users(?:\/[^/]+(?:\/password)?)?$/.test(path))return null;
 fail(405,'METHOD_NOT_ALLOWED','此操作不支持');
}
