import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.js';
import { initContinuity, handleContinuity, getLearningContext } from '../../server/continuity.js';

function fixture(t) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const at = new Date().toISOString();
  for (const id of ['alice','bob']) {
    store.run('INSERT INTO user_principals VALUES (?,?)',id,at);
    store.run("INSERT INTO users VALUES (?,?,?,'user',0,?)",id,id,'unused',at);
    store.run('INSERT INTO subjects VALUES (?,?,?,?,?,?)',`s-${id}`,id,'C++','code',at,at);
    store.run("INSERT INTO conversations VALUES (?,?,?,'learning',?,?,NULL)",`c-${id}`,`s-${id}`,'Iterator',at,at);
    store.run("INSERT INTO messages VALUES (?,?, 'user',?,1,?)",`m-${id}`,`c-${id}`,`${id} asks about iterator erase`,at);
  }
  initContinuity(store,{});
  let output='A source-grounded answer'; let captured;
  const ai={configured:true,generate:async input=>{captured=input; if(output instanceof Error) throw output; return output;}};
  const principal={id:'alice',username:'alice',role:'user'};
  const call=(method,path,body={},user=principal)=>handleContinuity({method,path,url:new URL(path,'http://localhost'),store,config:{},principal:user,body:async()=>body,ai});
  return {store,call,principal,setOutput:v=>output=v,getCaptured:()=>captured};
}

test('bounded learning context reports only evidence actually included',async t=>{
  const f=fixture(t);
  const at=new Date().toISOString();
  for(let i=0;i<8;i++) {
    f.store.run("INSERT INTO learning_memories VALUES (?,?,?,?,'inactive','summary',1,?,?)",`long-${i}`,'s-alice',`Memory ${i}`,'x'.repeat(6000)+` UNIQUE_END_${i}`,at,at);
    f.store.run('INSERT INTO conversation_memory_refs VALUES (?,?)','c-alice',`long-${i}`);
  }
  const context=await getLearningContext(f.store,f.principal,'c-alice','question');
  assert.ok(Array.isArray(context.entries));
  assert.ok(context.memories.length<8);
  for(const memory of context.memories) assert.match(context.content,new RegExp(`UNIQUE_END_${memory.id.split('-')[1]}`));
  assert.match(context.content,/未包含|未展开/);
});

test('subject state saves only on adoption and rejects stale or other-owner writes',async t=>{
  const f=fixture(t);
  assert.equal((await f.call('GET','/api/subjects/s-alice/state')).body.state.version,0);
  f.setOutput('User supplied updated state');
  const preview=await f.call('POST','/api/subjects/s-alice/state/preview',{input:'I finished chapter 2'});
  assert.equal(preview.body.content,'User supplied updated state');
  assert.equal((await f.call('GET','/api/subjects/s-alice/state')).body.state.content,'');
  const saved=await f.call('PUT','/api/subjects/s-alice/state',{content:'I finished chapter 2',version:0});
  assert.equal(saved.body.state.version,1);
  await assert.rejects(f.call('PUT','/api/subjects/s-alice/state',{content:'old overwrite',version:0}),e=>e.status===409);
  await assert.rejects(f.call('GET','/api/subjects/s-bob/state'),e=>e.status===403);
});

test('action advice includes only owned states and has no state side effects',async t=>{
  const f=fixture(t); await f.call('PUT','/api/subjects/s-alice/state',{content:'Needs help with erase',version:0});
  const before=f.store.all('SELECT * FROM subject_states');
  const r=await f.call('POST','/api/action-advice',{input:'I have 20 minutes'});
  assert.equal(r.body.advice,'A source-grounded answer');
  assert.match(JSON.stringify(f.getCaptured()),/Needs help with erase/);
  assert.deepEqual(f.store.all('SELECT * FROM subject_states'),before);
  await assert.rejects(f.call('POST','/api/action-advice',{input:'Plan',subjectIds:['s-bob']}),e=>e.status===403);
});

test('review creation persists selected evidence and rejects foreign sources',async t=>{
  const f=fixture(t);
  await assert.rejects(f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-bob'],requestId:'r1'}),e=>e.status===403);
  const result=await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],focus:'Why erase?',requestId:'r1'});
  const id=result.body.conversation.id;
  assert.equal(result.body.conversation.kind,'review');
  assert.match(JSON.stringify(f.getCaptured()),/alice asks about iterator erase/);
  assert.doesNotMatch(JSON.stringify(f.getCaptured()),/bob asks/);
  assert.equal(f.store.all('SELECT * FROM messages WHERE conversation_id=?',id).length,2);
  const again=await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],focus:'Why erase?',requestId:'r1'});
  assert.equal(again.body.conversation.id,id);
  assert.equal((await f.call('GET',`/api/reviews/${id}/sources`)).body.sources[0].id,'c-alice');
});

test('review provider failure preserves original user input and explicit warning',async t=>{
  const f=fixture(t); f.setOutput(new Error('provider unavailable'));
  const r=await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],focus:'Keep this question',requestId:'r1'});
  assert.ok(r.body.warning);
  const messages=f.store.all('SELECT * FROM messages WHERE conversation_id=?',r.body.conversation.id);
  assert.equal(messages.length,1); assert.equal(messages[0].role,'user');
  assert.match(messages[0].content,/Keep this question/);
});

test('memory candidates require explicit adoption, preserve sources and deduplicate replay',async t=>{
  const f=fixture(t);
  const review=(await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],requestId:'r1'})).body.conversation;
  f.setOutput(JSON.stringify({candidates:[{title:'Iterator erase',content:'I must update iterator after erase.',status:'active',sourceIds:['c-alice']}]}));
  const candidates=(await f.call('POST',`/api/reviews/${review.id}/candidates`)).body.candidates;
  assert.equal(candidates.length,1);
  assert.equal((await f.call('GET','/api/subjects/s-alice/memories')).body.memories.length,0);
  const keep=(await f.call('POST',`/api/candidates/${candidates[0].id}/decision`,{action:'keep'})).body;
  assert.equal(keep.memory.status,'active'); assert.equal(keep.memory.sources[0].id,'c-alice');
  const replay=(await f.call('POST',`/api/candidates/${candidates[0].id}/decision`,{action:'keep'})).body;
  assert.equal(replay.memory.id,keep.memory.id);
  assert.equal((await f.call('GET','/api/subjects/s-alice/memories')).body.memories.length,1);
  const ctx=await getLearningContext(f.store,f.principal,'c-alice','iterator');
  assert.match(ctx.content,/update iterator/);
  await f.call('PATCH',`/api/memories/${keep.memory.id}`,{status:'inactive',version:1});
  assert.doesNotMatch((await getLearningContext(f.store,f.principal,'c-alice','iterator')).content,/update iterator/);
  await assert.rejects(f.call('PATCH',`/api/memories/${keep.memory.id}`,{content:'overwrite',version:1}),e=>e.status===409);
});

test('deleted sources are unavailable and original content never enters later review context',async t=>{
  const f=fixture(t);
  const review=(await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],requestId:'r1'})).body.conversation;
  f.store.run("UPDATE conversations SET deleted_at='deleted' WHERE id='c-alice'");
  const sources=(await f.call('GET',`/api/reviews/${review.id}/sources`)).body.sources;
  assert.equal(sources[0].available,false);
  const context=await getLearningContext(f.store,f.principal,review.id,'erase');
  assert.doesNotMatch(context.content,/alice asks about iterator erase/);
});

test('malformed or foreign-source AI memory proposals cannot be adopted',async t=>{
  const f=fixture(t);
  const review=(await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],requestId:'r1'})).body.conversation;
  f.setOutput('not JSON');
  await assert.rejects(f.call('POST',`/api/reviews/${review.id}/candidates`),e=>e.code==='AI_INVALID_OUTPUT');
  f.setOutput(JSON.stringify({candidates:[{title:'other',content:'private',sourceIds:['c-bob'],status:'active'}]}));
  await assert.rejects(f.call('POST',`/api/reviews/${review.id}/candidates`),e=>e.code==='AI_INVALID_OUTPUT');
  assert.equal(f.store.all('SELECT * FROM learning_memories').length,0);
});

test('inactive memory is used only when explicitly selected and never across subjects',async t=>{
  const f=fixture(t);const at=new Date().toISOString();
  f.store.run("INSERT INTO learning_memories VALUES ('old','s-alice','Iterators','An old reusable insight','inactive','old',1,?,?)",at,at);
  f.store.run("INSERT INTO learning_memories VALUES ('foreign','s-bob','secret','Other user content','active','secret',1,?,?)",at,at);
  assert.doesNotMatch((await getLearningContext(f.store,f.principal,'c-alice','iterator')).content,/old reusable/);
  await assert.rejects(f.call('PUT','/api/conversations/c-alice/memory-references',{memoryIds:['foreign']}),e=>e.status===403);
  const selected=await f.call('PUT','/api/conversations/c-alice/memory-references',{memoryIds:['old']});
  assert.equal(selected.body.memories[0].id,'old');
  assert.match((await getLearningContext(f.store,f.principal,'c-alice','continue')).content,/old reusable/);
  await f.call('PUT','/api/conversations/c-alice/memory-references',{memoryIds:[]});
  assert.doesNotMatch((await getLearningContext(f.store,f.principal,'c-alice','continue')).content,/old reusable/);
});

test('review answer source records do not prevent deleting the original messages',async t=>{
  const f=fixture(t);const r=await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],requestId:'r1'});
  const id=r.body.conversation.id;
  f.store.run('DELETE FROM ai_runs WHERE conversation_id=?',id);
  assert.doesNotThrow(()=>f.store.run('DELETE FROM messages WHERE conversation_id=?',id));
  assert.equal(f.store.all('SELECT * FROM continuity_answer_sources').length,0);
});

test('delayed adoption cannot preserve a candidate after its review was deleted',async t=>{
  const f=fixture(t);
  const review=(await f.call('POST','/api/subjects/s-alice/reviews',{sourceIds:['c-alice'],requestId:'delayed-adopt'})).body.conversation;
  f.setOutput(JSON.stringify({candidates:[{title:'Iterator',content:'A concrete learning point',status:'active',sourceIds:['c-alice']}]}));
  const candidate=(await f.call('POST',`/api/reviews/${review.id}/candidates`)).body.candidates[0];
  let finish;
  const pending=handleContinuity({store:f.store,principal:f.principal,method:'POST',path:`/api/candidates/${candidate.id}/decision`,body:()=>new Promise(resolve=>finish=resolve)});
  f.store.run("UPDATE conversations SET deleted_at='deleted' WHERE id=?",review.id);
  finish({action:'keep'});
  await assert.rejects(pending,e=>e.status===404);
  assert.equal(f.store.get('SELECT COUNT(*) AS n FROM learning_memories').n,0);
});
