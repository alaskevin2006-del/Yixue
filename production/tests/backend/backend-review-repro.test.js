import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../server/store.js';
import { createCore } from '../../server/core.js';
import { initContinuity, handleContinuity, getLearningContext, recordAnswerSources } from '../../server/continuity.js';
import { initResources, handleResources } from '../../server/resources.js';
import { saveFile } from '../../server/resource-files.js';
import { createBackup, restoreBackup } from '../../scripts/backup.mjs';

function fixture(t) {
  const store=new Store(':memory:');t.after(()=>store.close());
  store.run("INSERT INTO user_principals VALUES ('u','now')");
  store.run("INSERT INTO users VALUES ('u','user','unused','user',0,'now')");
  store.run("INSERT INTO subjects VALUES ('s','u','Math','book','now','now')");
  store.run("INSERT INTO conversations VALUES ('c','s','Chat','learning','now','now',NULL)");
  initContinuity(store);
  return {store,principal:{id:'u',role:'user',username:'user'}};
}

test('review creation works after migrating the v1 conversation schema',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'yixue-review-migration-'));
  const path=join(dir,'db.sqlite');
  const legacy=new DatabaseSync(path);
  legacy.exec(readFileSync(new URL('../../server/db/schema.sql',import.meta.url),'utf8'));
  legacy.exec("INSERT INTO user_principals VALUES ('u','now'); INSERT INTO subjects VALUES ('s','u','Math','now','now')");legacy.close();
  const store=new Store(path);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});initContinuity(store);
  const result=await handleContinuity({store,principal:{id:'u',role:'user'},method:'POST',path:'/api/subjects/s/reviews',body:async()=>({sourceIds:[],requestId:'migrated-review'}),ai:{configured:true,generate:async()=> 'Review answer'}});
  assert.equal(result.status,201);assert.equal(result.body.conversation.kind,'review');
  assert.equal(store.get('SELECT kind FROM conversations WHERE id=?',result.body.conversation.id).kind,'review');
});

test('explicit memory evidence survives a full recent conversation context',async t=>{
  const {store,principal}=fixture(t);let captured;
  store.run("INSERT INTO messages VALUES ('old-user','c','user',?,1,'now')",'a'.repeat(16000));
  store.run("INSERT INTO messages VALUES ('old-answer','c','assistant',?,2,'now')",'b'.repeat(16000));
  store.run("INSERT INTO learning_memories VALUES ('memory','s','Selected insight','EXPLICIT_MEMORY_EVIDENCE','inactive','insight',1,'now','now')");
  store.run("INSERT INTO conversation_memory_refs VALUES ('c','memory')");
  const core=createCore(store,{ai:{configured:true,generate:async input=>{captured=input;return 'Answer';}},contextHooks:{learningContext:getLearningContext,recordAnswerSources}});
  await core.handle({method:'POST',path:'/api/conversations/c/messages',principal,body:async()=>({content:'q'.repeat(16000),requestId:'full-context'})});await core.drain();
  assert.ok(captured.messages.reduce((n,m)=>n+m.content.length,0)<=48000);
  assert.ok(captured.messages.some(message=>message.content.includes('EXPLICIT_MEMORY_EVIDENCE')),'explicit memory was silently dropped from provider input');
});

test('message body arriving after conversation deletion cannot recreate raw originals',async t=>{
  const {store,principal}=fixture(t);
  const core=createCore(store,{ai:{configured:true,generate:async()=> 'Answer'}});
  let finishBody;
  const pending=core.handle({method:'POST',path:'/api/conversations/c/messages',principal,body:()=>new Promise(resolve=>{finishBody=resolve;})});
  await core.handle({method:'DELETE',path:'/api/conversations/c',principal});
  finishBody({content:'Raw text that should never survive deletion',requestId:'late-body'});
  let error;try{await pending;}catch(e){error=e;}await core.drain();
  assert.equal(store.get("SELECT COUNT(*) AS n FROM messages WHERE conversation_id='c'").n,0);
  assert.equal(error?.status,404);
});

test('pending same-point candidates cannot create duplicate memories after another adoption',async t=>{
  const {store,principal}=fixture(t);let output='Review answer';
  const ai={configured:true,generate:async()=>output};
  const call=(method,path,body={})=>handleContinuity({store,principal,method,path,body:async()=>body,ai});
  store.run("INSERT INTO messages VALUES ('source-message','c','user','I confuse iterator invalidation after erase.',1,'now')");
  const first=(await call('POST','/api/subjects/s/reviews',{sourceIds:['c'],requestId:'same-point-1'})).body.conversation;
  const second=(await call('POST','/api/subjects/s/reviews',{sourceIds:['c'],requestId:'same-point-2'})).body.conversation;
  output=JSON.stringify({candidates:[{title:'Iterator invalidation',content:'I need to account for iterator invalidation after erase.',status:'active',sourceIds:['c']}]});
  const a=(await call('POST',`/api/reviews/${first.id}/candidates`)).body.candidates[0];
  const b=(await call('POST',`/api/reviews/${second.id}/candidates`)).body.candidates[0];
  await call('POST',`/api/candidates/${a.id}/decision`,{action:'keep'});
  try{await call('POST',`/api/candidates/${b.id}/decision`,{action:'keep'});}catch(error){assert.equal(error.status,409);}
  assert.equal(store.get("SELECT COUNT(*) AS n FROM learning_memories WHERE subject_space_id='s'").n,1,'same learning point should remain one stable memory, or require explicit conflict resolution');
});

test('offline restored resources preserve protected downloads and extracted content',async t=>{
  const root=mkdtempSync(join(tmpdir(),'yixue-review-restore-'));let restored;t.after(()=>{restored?.close();rmSync(root,{recursive:true,force:true});});
  const data=join(root,'data'),config={uploadsDir:join(data,'uploads')};
  const store=new Store(join(data,'yixue.sqlite'));initResources(store,config);
  const content='真实资料正文 — backup and restore';const key=await saveFile(config,Buffer.from(content));
  store.run("INSERT INTO resources (id,scope,owner_user_id,name,original_name,mime,size,storage_key,extraction_status,page_count,created_at,updated_at) VALUES ('r','private','u','资料','资料.txt','text/plain',?,?,'ready',1,'now','now')",Buffer.byteLength(content),key);
  store.run("INSERT INTO private_resources VALUES ('r','u',NULL)");
  store.run("INSERT INTO resource_pages VALUES ('r',1,?)",content);store.close();
  await createBackup({dataDir:data,outputDir:join(root,'backup'),offline:true});
  await restoreBackup({backupDir:join(root,'backup'),outputDir:join(root,'restored'),offline:true});
  restored=new Store(join(root,'restored','yixue.sqlite'));
  const call=(path,user='u')=>handleResources({store:restored,config:{uploadsDir:join(root,'restored','uploads')},principal:{id:user,role:'user'},method:'GET',path,url:new URL(path,'http://local')});
  const download=await call('/api/resources/r/download');assert.equal(readFileSync(download.file.path,'utf8'),content);
  assert.equal((await call('/api/resources/r/content')).body.content,content);
  await assert.rejects(call('/api/resources/r/download','foreign'),error=>error.status===404);
});
