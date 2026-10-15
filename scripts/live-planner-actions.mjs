// Run only in the isolated test container after staging the release.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(process.env.YIXUE_ENVIRONMENT!=='test')throw Error('Test environment required');
const origin=process.env.YIXUE_ORIGIN,base=origin+'/test';
const credentials=JSON.parse(await readFile('/data/operations/test-account.json','utf8'));
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(credentials)});assert.equal(login.status,200);const identity=await login.json();
const headers={origin,'content-type':'application/json',cookie:login.headers.get('set-cookie').split(';')[0],'x-csrf-token':identity.csrfToken};
async function api(path,data){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(180000)});assert.ok(r.ok,path+' '+r.status);return r.status===204?null:r.json();}
const report={at:new Date().toISOString(),environment:'test'};
try{
 const before=(await api('/api/planner')).records;
 const chat=(await api('/api/planner/records',{kind:'chat',title:'对话确认操作验收'})).record;
 const path='/api/planner/chats/'+chat.id+'/messages';
 const proposed=(await api(path,{requestId:crypto.randomUUID(),content:'请提出以下3项操作，等待我确认再执行：新增2026年10月17日19:00到19:30的日程“数组复习验收”，新增2026年10月18日19:00到19:30的日程“链表复习验收”，新增规划笔记“长期目标验收”，完整正文为“本月目标是理解数组和链表，每周各练习一次。”。时间为北京时间。请用操作提案输出。'})).record;
 assert.equal(proposed.proposal?.status,'pending');assert.equal(proposed.proposal.operations.length,3);assert.match(proposed.messages.at(-1).content,/等待你确认/);
 assert.equal((await api('/api/planner')).records.filter(r=>r.kind!=='chat').length,before.filter(r=>r.kind!=='chat').length);report.noWriteBeforeConfirmation=true;
 const confirmation={content:'确认',requestId:crypto.randomUUID(),proposalId:proposed.proposal.id};const executed=(await api(path,confirmation)).record;assert.equal(executed.proposal.status,'executed');
 const records=(await api('/api/planner')).records;for(const operation of proposed.proposal.operations){const saved=records.find(r=>r.id===operation.id);assert.ok(saved);for(const [key,value] of Object.entries(operation.data))assert.equal(saved[key],value);}
 await api(path,confirmation);await api(path,{content:'确认',requestId:crypto.randomUUID(),proposalId:proposed.proposal.id});assert.equal((await api('/api/planner')).records.length,records.length);
 report.realAiProposal=true;report.confirmedWrites=3;report.repeatedConfirmationSafe=true;report.chatId=chat.id;report.recordIds=proposed.proposal.operations.map(o=>o.id);
 console.log(JSON.stringify(report));
}finally{await api('/api/auth/logout',{});}
