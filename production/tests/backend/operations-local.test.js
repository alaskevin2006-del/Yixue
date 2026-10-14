import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

test('local launcher persists a real account and subject across process restart in explicit isolated data directory',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'yixue-local-launcher-'));let child;
  async function stop(){if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}}
  t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
  async function start(){
    child=spawn(process.execPath,[fileURLToPath(new URL('../../../scripts/serve-product-demo.mjs',import.meta.url))],{env:{...process.env,NODE_ENV:'development',YIXUE_DEMO_PORT:'0',YIXUE_DEMO_DATA_DIR:dir,YIXUE_DEMO_USERNAME:'local-admin',YIXUE_DEMO_PASSWORD:'local-persistence-password'},stdio:['ignore','pipe','pipe']});
    const address=await new Promise((resolve,reject)=>{let output='',errors='';const timer=setTimeout(()=>reject(Error('Local launch timed out')),10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',chunk=>errors+=chunk);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(Error(`Local launch exited ${code}: ${errors}`));});});
    const login=await fetch(address+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'local-admin',password:'local-persistence-password'})});assert.equal(login.status,200);
    const auth=await login.json();return {address,headers:{cookie:login.headers.get('set-cookie').split(';')[0],'content-type':'application/json','x-csrf-token':auth.csrfToken}};
  }
  let run=await start();const created=await fetch(run.address+'/api/subjects',{method:'POST',headers:run.headers,body:JSON.stringify({name:'persists after restart'})});assert.equal(created.status,201);const saved=(await created.json()).subject;
  await stop();run=await start();const response=await fetch(run.address+'/api/subjects',{headers:run.headers});assert.equal(response.status,200);assert.ok((await response.json()).subjects.some(s=>s.id===saved.id&&s.name==='persists after restart'));
});
