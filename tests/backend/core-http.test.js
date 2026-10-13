import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../../server/store.js';

async function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'yixue-core-http-'));
  const module = await import('../../server/production.js').catch(() => null);
  assert.ok(module?.createProductionServer, 'authenticated production HTTP server must exist');
  const store = new Store(join(dir, 'db.sqlite'));
  const config = { adminUsername:'admin', adminPassword:'strong-admin-pass', secureCookies:false, sessionTtlMs:86400000, uploadsDir:join(dir,'uploads'), ...options.config };
  let server = await module.createProductionServer(store, { config, ai: options.ai ?? { configured:true, generate:async () => '解释答案' }, contextHooks:options.contextHooks });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '', csrf = '';
    return {
      async call(path, method='GET', body, headers={}) {
        const response = await fetch(base+path, {method,headers:{...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers}, body:body===undefined?undefined:JSON.stringify(body)});
        if (response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
        const data = response.status===204?null:await response.json();
        if(data?.csrfToken) csrf=data.csrfToken;
        return {status:response.status, data, response};
      },
      async login(username='admin',password='strong-admin-pass') { return this.call('/api/auth/login','POST',{username,password}); }
    };
  };
  t.after(async()=>{await new Promise(resolve=>server.close(resolve)); await server.drain?.(); store.close(); rmSync(dir,{recursive:true,force:true});});
  return {store,client,config, async restart(){ await new Promise(resolve=>server.close(resolve)); await server.drain?.(); server=await module.createProductionServer(store,{config,ai:options.ai??{configured:true,generate:async()=> '恢复答案'}}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); base=`http://127.0.0.1:${server.address().port}`; }};
}
async function conversation(c) { const s=await c.call('/api/subjects','POST',{name:'数学'}); assert.equal(s.status,201); const r=await c.call(`/api/subjects/${s.data.subject.id}/conversations`,'POST',{}); assert.equal(r.status,201); return {subject:s.data.subject, conversation:r.data.conversation}; }
async function settled(c,id) { for(let i=0;i<100;i++){ const r=await c.call('/api/runs/'+id); if(['completed','failed','cancelled'].includes(r.data.run.status))return r.data.run; await new Promise(resolve=>setTimeout(resolve,10)); } throw Error('run never settled'); }

test('real sessions reject dev impersonation, enforce tenant isolation, CSRF and account reset',async t=>{
  const f=await setup(t), admin=f.client(), other=f.client(), anonymous=f.client();
  assert.equal((await anonymous.call('/api/subjects','GET',undefined,{'x-yixue-dev-user':'admin'})).status,401);
  assert.equal((await admin.login('admin','wrong-password')).status,401);
  const login=await admin.login(); assert.equal(login.status,200); assert.ok(login.data.csrfToken); assert.match(login.response.headers.get('set-cookie'),/HttpOnly/);
  assert.equal((await admin.call('/api/subjects','POST',{name:'bad'},{'x-csrf-token':''})).status,403);
  assert.equal((await admin.call('/api/subjects','POST',{name:'bad'},{'x-csrf-token':'é'.repeat(48)})).status,403);
  assert.equal((await admin.call('/api/subjects','POST',{name:'bad'},{origin:'https://evil.example'})).status,403);
  const user=await admin.call('/api/admin/users','POST',{username:'learner',password:'learner-password',role:'user'}); assert.equal(user.status,201);
  assert.equal((await other.login('learner','learner-password')).status,200);
  const {subject,conversation:conv}=await conversation(admin);
  assert.equal((await other.call(`/api/subjects/${subject.id}/conversations`)).status,404);
  assert.equal((await other.call(`/api/conversations/${conv.id}/messages`)).status,404);
  assert.equal((await other.call('/api/admin/users')).status,403);
  assert.equal((await admin.call(`/api/admin/users/${user.data.user.id}/password`,'POST',{password:'replacement-password'})).status,204);
  assert.equal((await other.call('/api/auth/me')).status,401);
  assert.equal((await other.login('learner','replacement-password')).status,200);
  assert.equal((await other.call('/api/auth/password','POST',{currentPassword:'replacement-password',newPassword:'changed-password'})).status,204);
  assert.equal((await other.call('/api/auth/me')).status,401);
  assert.equal((await other.login('learner','changed-password')).status,200);
  assert.equal((await other.call('/api/auth/logout','POST',{})).status,204);
  assert.equal((await other.call('/api/auth/me')).status,401);
});

test('messages persist across restart and request replay produces one assistant completion',async t=>{
  const f=await setup(t), c=f.client();await c.login(); const {subject,conversation:conv}=await conversation(c);
  assert.equal((await c.call(`/api/subjects/${subject.id}`,'PATCH',{icon:'∑'})).data.subject.icon,'∑');
  const first=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'为什么？',requestId:'stable-request'});assert.equal(first.status,201);
  assert.equal((await settled(c,first.data.run.id)).status,'completed');
  const replay=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'为什么？',requestId:'stable-request'}); assert.equal(replay.status,200); assert.equal(replay.data.message.id,first.data.message.id);assert.equal(replay.data.run.id,first.data.run.id);
  assert.equal((await c.call(`/api/conversations/${conv.id}`)).data.conversation.latest_run.status,'completed');
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`)).data.runs.length,1);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'different',requestId:'stable-request'})).status,409);
  await f.restart(); const messages=(await c.call(`/api/conversations/${conv.id}/messages`)).data.messages;
  assert.deepEqual(messages.map(m=>m.role),['user','assistant']);assert.equal(messages[1].content,'解释答案');
  assert.equal((await c.call(`/api/conversations/${conv.id}/retry`,'POST',{messageId:messages[0].id})).status,409);
});

test('restart surfaces interrupted pending work and latest unanswered review message can retry',async t=>{
  const f=await setup(t),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  f.store.run("INSERT INTO messages VALUES ('review-user',?,'user','selected review question',1,'now')",conv.id);
  f.store.run("INSERT INTO ai_runs(id,conversation_id,user_message_id,status,created_at,updated_at) VALUES ('interrupted',?,'review-user','running','now','now')",conv.id);
  await f.restart(); const result=await c.call('/api/runs/interrupted');assert.equal(result.data.run.status,'failed');assert.equal(result.data.run.error_code,'AI_INTERRUPTED');
  const retry=await c.call(`/api/conversations/${conv.id}/retry`,'POST',{messageId:'review-user'});assert.equal((await settled(c,retry.data.run.id)).status,'completed');
  const second=await conversation(c);f.store.run("INSERT INTO messages VALUES ('review-no-run',?,'user','another review question',1,'now')",second.conversation.id);
  const reviewRetry=await c.call(`/api/conversations/${second.conversation.id}/retry`,'POST',{messageId:'review-no-run'});assert.equal((await settled(c,reviewRetry.data.run.id)).status,'completed');
});

test('same conversation serializes pending turns and authenticated JSON size is limited',async t=>{
  let release;const f=await setup(t,{ai:{configured:true,generate:()=>new Promise(resolve=>{release=resolve;})}}),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'first',requestId:'r1'});
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'second',requestId:'r2'})).status,409);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'x'.repeat(70000),requestId:'r3'})).status,413);
  const retry=await c.call(`/api/conversations/${conv.id}/retry`,'POST',{messageId:send.data.message.id});assert.equal(retry.data.run.id,send.data.run.id);
  while(!release)await new Promise(resolve=>setTimeout(resolve,5));release('one answer');await settled(c,send.data.run.id);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`)).data.messages.length,2);
});

test('provider failure leaves an explicit failed run and retry never duplicates user message',async t=>{
  let fail=true;const f=await setup(t,{ai:{configured:true,generate:async()=>{if(fail)throw Error('secret API key in external error');return 'retry result';}}}),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'question',requestId:'r1'});const failed=await settled(c,send.data.run.id);assert.equal(failed.status,'failed');assert.equal(failed.error_code,'AI_PROVIDER_ERROR');assert.ok(!JSON.stringify(failed).includes('secret'));
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`)).data.messages.length,1);
  fail=false;const retry=await c.call(`/api/conversations/${conv.id}/retry`,'POST',{messageId:send.data.message.id});assert.equal((await settled(c,retry.data.run.id)).status,'completed');
  assert.deepEqual((await c.call(`/api/conversations/${conv.id}/messages`)).data.messages.map(m=>m.role),['user','assistant']);
});

test('deleting a conversation during generation revokes original access and discards late answer',async t=>{
  let release;const f=await setup(t,{ai:{configured:true,generate:()=>new Promise(resolve=>{release=resolve;})}}),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'question',requestId:'r1'});while(!release)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await c.call(`/api/conversations/${conv.id}`,'DELETE')).status,204);release('late answer');await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`)).status,404);assert.equal((await c.call('/api/runs/'+send.data.run.id)).status,404);
  assert.equal(f.store.get('SELECT count(*) AS n FROM messages WHERE conversation_id=?',conv.id).n,0);
});

test('generation uses selected evidence outside transactions, bounds history and validates input',async t=>{
  let captured;const f=await setup(t,{ai:{configured:true,generate:async input=>{captured=input;return 'answer';}},contextHooks:{resourceContext:(store,p,id)=>{assert.equal(store.db.isTransaction,false);return{content:'explicit private reference'};},learningContext:async(store,p,id,q)=>{assert.equal(store.db.isTransaction,false);return{content:'relevant Active memory'};}}}),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'x'.repeat(16001),requestId:'r1'})).status,400);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'bad\0text',requestId:'r1'})).status,400);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'bad\ud800text',requestId:'r1'})).status,400);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',[])).status,400);
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'question',requestId:'r1'});await settled(c,send.data.run.id);
  assert.ok(!captured.system.includes('explicit private reference'));assert.match(JSON.stringify(captured.messages),/explicit private reference/);assert.match(JSON.stringify(captured.messages),/relevant Active memory/);
});

test('review answer records captured evidence atomically and history stays within context budget',async t=>{
  let captured;const f=await setup(t,{config:{contextChars:20000},ai:{configured:true,generate:async input=>{captured=input;return 'answer';}},contextHooks:{learningContext:async()=>({content:'review evidence',sources:[{id:'source',available:true}]}),recordAnswerSources:(store,p,id,messageId,evidence)=>{assert.equal(store.db.isTransaction,true);store.run('INSERT INTO answer_evidence VALUES (?,?,?)',messageId,id,evidence.sources[0].id);}}}),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  f.store.db.exec('CREATE TABLE answer_evidence(message_id TEXT,conversation_id TEXT,source_id TEXT)');f.store.run("UPDATE conversations SET kind='review' WHERE id=?",conv.id);
  for(let n=1;n<=30;n++)f.store.run('INSERT INTO messages VALUES (?,?,?,?,?,?)','old-'+n,conv.id,n%2?'user':'assistant','z'.repeat(2000),n,'now');
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'latest question',requestId:'r1'});assert.equal((await settled(c,send.data.run.id)).status,'completed');
  const row=f.store.get('SELECT * FROM answer_evidence');assert.equal(row.source_id,'source');assert.equal(f.store.get('SELECT role FROM messages WHERE id=?',row.message_id).role,'assistant');
  assert.ok(captured.messages.reduce((sum,m)=>sum+m.content.length,0)<=20000);assert.equal(captured.messages.at(-1).content,'latest question');assert.ok(captured.messages.length<=25);
});

test('bootstrap refuses missing admin secret, sessions expire, and login attempts are bounded',async t=>{
  const module=await import('../../server/production.js');const store=new Store(':memory:');await assert.rejects(module.createProductionServer(store,{config:{}}),/ADMIN_BOOTSTRAP_REQUIRED/);assert.equal(store.get('SELECT count(*) AS n FROM users').n,0);store.close();
  const f=await setup(t),c=f.client();await c.login();f.store.run('UPDATE sessions SET expires_at=0');assert.equal((await c.call('/api/auth/me')).status,401);
  for(let n=0;n<10;n++)assert.equal((await c.login('unknown','wrong-password')).status,401);
  assert.equal((await c.login('unknown','wrong-password')).status,429);
});

test('unconfigured AI creates failed run without fabricated assistant answer',async t=>{
  const f=await setup(t,{ai:{configured:false,generate:async()=>{throw Error('must not be invoked');}}}),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'question',requestId:'r1'}); const run=await settled(c,send.data.run.id);assert.equal(run.error_code,'AI_NOT_CONFIGURED');assert.equal((await c.call(`/api/conversations/${conv.id}/messages`)).data.messages.length,1);
});

test('original message preserves indentation and idempotency rejects distinct whitespace content',async t=>{
  const f=await setup(t),c=f.client();await c.login();const {conversation:conv}=await conversation(c);const original='  print("x")  \n';
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:original,requestId:'original'});assert.equal(send.data.message.content,original);await settled(c,send.data.run.id);
  const messages=(await c.call(`/api/conversations/${conv.id}/messages`)).data.messages;assert.equal(messages[0].content,original);
  assert.equal((await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'print("x")',requestId:'original'})).status,409);
});

test('explicit evidence gets space before history and provenance excludes omitted memory entries',async t=>{
  let captured;const entries=[{content:'EXPLICIT_USED '.repeat(50),memory:{id:'used',version:1},explicit:true},{content:'OMITTED_MEMORY '.repeat(1000),memory:{id:'omitted',version:2},explicit:true}];
  const f=await setup(t,{config:{contextChars:20000},ai:{configured:true,generate:async input=>{captured=input;return 'answer';}},contextHooks:{resourceContext:()=>({content:'RESOURCE_EVIDENCE '.repeat(50)}),learningContext:async()=>({content:entries.map(e=>e.content).join('\n'),entries,memories:entries.map(e=>e.memory),sources:[]}),recordAnswerSources:(store,p,id,messageId,context)=>{for(const memory of context?.memories??[])store.run('INSERT INTO used_memory VALUES (?,?)',messageId,memory.id);}}}),c=f.client();await c.login();const {conversation:conv}=await conversation(c);
  f.store.db.exec('CREATE TABLE used_memory(message_id TEXT,memory_id TEXT)');f.store.run("INSERT INTO messages VALUES ('old-user',?,'user',?,1,'now')",conv.id,'a'.repeat(16000));f.store.run("INSERT INTO messages VALUES ('old-answer',?,'assistant',?,2,'now')",conv.id,'b'.repeat(16000));
  const send=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'q'.repeat(16000),requestId:'evidence-first'});assert.equal((await settled(c,send.data.run.id)).status,'completed');
  const delivered=captured.messages.map(m=>m.content).join('\n');assert.match(delivered,/EXPLICIT_USED/);assert.match(delivered,/RESOURCE_EVIDENCE/);assert.ok(!delivered.includes('OMITTED_MEMORY'));assert.ok(delivered.includes('未展开'));assert.equal(captured.messages.at(-1).content,'q'.repeat(16000));assert.ok(captured.messages.reduce((n,m)=>n+m.content.length,0)<=20000);
  assert.deepEqual(f.store.all('SELECT memory_id FROM used_memory').map(r=>r.memory_id),['used']);
});

test('first user message names a placeholder conversation without overwriting a chosen title',async t=>{
  const f=await setup(t),c=f.client();await c.login();const {subject,conversation:conv}=await conversation(c);
  const first=await c.call(`/api/conversations/${conv.id}/messages`,'POST',{content:'  如何求导\n请给例子  ',requestId:'title-1'});await settled(c,first.data.run.id);assert.equal((await c.call(`/api/conversations/${conv.id}`)).data.conversation.title,'如何求导 请给例子');
  const named=(await c.call(`/api/subjects/${subject.id}/conversations`,'POST',{title:'自选标题'})).data.conversation;const second=await c.call(`/api/conversations/${named.id}/messages`,'POST',{content:'自动标题不应该覆盖',requestId:'title-2'});await settled(c,second.data.run.id);assert.equal((await c.call(`/api/conversations/${named.id}`)).data.conversation.title,'自选标题');
});
