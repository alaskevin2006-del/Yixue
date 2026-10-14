// Executes ONLY inside the isolated test service. Never uses production user data.
import {readFile} from 'node:fs/promises';
if(process.env.YIXUE_ENVIRONMENT!=='test')throw Error('Isolated test environment required');
const origin=process.env.YIXUE_ORIGIN,base=origin+'/test';
const credentials=JSON.parse(await readFile('/data/operations/test-account.json','utf8'));
async function session(username,password){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username,password})});if(!r.ok)throw Error('Login failed');const auth=await r.json();return {cookie:r.headers.get('set-cookie').split(';')[0],origin,'x-csrf-token':auth.csrfToken};}
const headers=await session(credentials.username,credentials.password);
async function api(path,data,method=data===undefined?'GET':'POST',h=headers){const multipart=data instanceof FormData;const r=await fetch(base+path,{method,headers:{...h,...(multipart||data===undefined?{}:{'content-type':'application/json'})},body:data===undefined?undefined:multipart?data:JSON.stringify(data),signal:AbortSignal.timeout(180000)});const body=await r.json().catch(()=>null);if(!r.ok)throw Error(path+' '+r.status+' '+(body?.error?.code||''));return body;}
const subjects=(await api('/api/subjects')).subjects;
const subject=subjects.find(s=>s.name==='上线验收')??(await api('/api/subjects',{name:'上线验收'})).subject;
const chat=(await api('/api/subjects/'+subject.id+'/conversations',{})).conversation;
await api('/api/conversations/'+chat.id+'/messages',{requestId:crypto.randomUUID(),content:'我常把 vector::erase 后的迭代器递增写错。请用三句话解释返回值和循环删除的写法。'});
let detail;
for(let n=0;n<90;n++){detail=await api('/api/conversations/'+chat.id+'/messages');if(detail.runs.some(r=>r.status==='failed'))throw Error('Learning AI failed: '+detail.runs.at(-1).error_code);if(detail.messages.some(m=>m.role==='assistant'))break;await new Promise(r=>setTimeout(r,2000));}
if(!detail.messages.some(m=>m.role==='assistant'))throw Error('AI wait timed out');
const plan=(await api('/api/planner/records',{kind:'chat',title:'上线验收规划'})).record;
const planned=await api('/api/planner/chats/'+plan.id+'/messages',{requestId:crypto.randomUUID(),content:'我今天只有十分钟，想练一次循环删除，请给一个简短行动建议。'});
if(planned.record.messages.at(-1).role!=='assistant')throw Error('Planner answer missing');
const candidates=(await api('/api/conversations/'+chat.id+'/candidates',{})).candidates;
let memoryId=null;if(candidates[0]){const c=candidates[0];memoryId=(await api('/api/candidates/'+c.id+'/decision',{action:'keep',title:c.title,content:c.content,version:c.target_memory_version})).memory.id;}
const admin=await session(process.env.YIXUE_ADMIN_USERNAME,process.env.YIXUE_ADMIN_PASSWORD);
const course=(await api('/api/courses',{name:'验收示例课程'},'POST',admin)).course;
const form=new FormData();form.set('file',new Blob(['这是隔离测试环境的公开文件，用于核验下载内容。'],{type:'text/plain'}),'验收资料.txt');form.set('courseId',course.id);form.set('description','测试投稿审核闭环');
const submission=(await api('/api/submissions',form)).submission;
const accepted=await api('/api/submissions/'+submission.id+'/review',{decision:'accept',note:'隔离环境验收通过'},'POST',admin);
await api('/api/auth/logout',{},'POST',admin);await api('/api/auth/logout',{});
console.log(JSON.stringify({environment:'test',learningAI:true,plannerAI:true,candidateCount:candidates.length,userConfirmedMemory:!!memoryId,submissionReviewed:true,subjectId:subject.id,chatId:chat.id,plannerId:plan.id,memoryId,publicResourceId:accepted.resource.id}));
