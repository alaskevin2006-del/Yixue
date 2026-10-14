import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('runtime initializes feature modules and serves real authenticated core and resource routes',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'yixue-runtime-'));
  const module=await import('../../server/start.js').catch(()=>null);assert.ok(module?.startApplication,'production runtime needs injectable entrypoint');
  const running=await module.startApplication({host:'127.0.0.1',port:0,dbPath:join(dir,'db.sqlite'),uploadsDir:join(dir,'uploads'),adminUsername:'admin',adminPassword:'runtime-secret-password',secureCookies:false,principalMode:'SESSION',ai:{}},{ai:{configured:true,generate:async()=> '实际测试服务回答'}});
  t.after(async()=>{await running.stop();rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${running.server.address().port}`;
  const health=await fetch(base+'/api/health');assert.equal((await health.json()).capabilities.ai,true);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'runtime-secret-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const subjects=await fetch(base+'/api/subjects',{headers:{cookie}});assert.equal(subjects.status,200);
  const resources=await fetch(base+'/api/resources?scope=private',{headers:{cookie}});assert.equal(resources.status,200);assert.deepEqual((await resources.json()).resources,[]);
  const auth=await login.json();
  const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{cookie,'x-csrf-token':auth.csrfToken,'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(response.ok,`${path} failed ${response.status}`);return response.json();};
  const subject=(await post('/api/subjects',{name:'review subject'})).subject;
  const source=(await post(`/api/subjects/${subject.id}/conversations`,{})).conversation;
  running.store.run("INSERT INTO messages VALUES ('source-user',?,'user','真实原始证据',1,'now')",source.id);
  const review=(await post(`/api/subjects/${subject.id}/reviews`,{sourceIds:[source.id],requestId:'review-1'})).conversation;
  const send=await post(`/api/conversations/${review.id}/messages`,{content:'继续复习',requestId:'follow-up'});
  for(let i=0;i<100;i++){const run=running.store.get('SELECT * FROM ai_runs WHERE id=?',send.run.id);if(run.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,10));}
  const run=running.store.get('SELECT * FROM ai_runs WHERE id=?',send.run.id);assert.equal(run.status,'completed');
  assert.equal(running.store.get('SELECT source_id FROM continuity_answer_sources WHERE message_id=?',run.assistant_message_id)?.source_id,source.id);
});
