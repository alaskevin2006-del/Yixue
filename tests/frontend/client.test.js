import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../../client/api.js';
import { waitForRun, createMessageSender } from '../../client/workflows.js';

test('API sends authenticated JSON and reports provider errors without answers', async () => {
  let sent;
  const api = createApi(async (url, init) => {
    sent = {url, init};
    return new Response(JSON.stringify({error:{code:'AI_NOT_CONFIGURED',message:'尚未配置 AI'}}), {status:503});
  });
  await assert.rejects(api('/api/action-advice', {method:'POST',body:{input:'下一步'}}), error => error.code === 'AI_NOT_CONFIGURED' && error.message === '尚未配置 AI');
  assert.equal(sent.init.credentials, 'same-origin');
  assert.equal(sent.init.body, '{"input":"下一步"}');
});

test('run polling follows queued/running to success and retains explicit failure', async () => {
  const statuses = ['queued', 'running', 'succeeded'];
  let calls = 0;
  const run = await waitForRun(async () => ({run:{id:'r1',status:statuses[calls++]}}), 'r1', {sleep:async()=>{}});
  assert.equal(run.status, 'succeeded');
  assert.equal(calls, 3);
  await assert.rejects(waitForRun(async()=>({run:{id:'r2',status:'failed',error_code:'PROVIDER',error_message:'服务失败'}}), 'r2'), error=>error.message === '服务失败' && error.run.id === 'r2');
});

test('uncertain send retry reuses request ID, and accepted sends clear it', async () => {
  const bodies=[];
  let attempt=0;
  const send = createMessageSender(async (_path, options) => {
    bodies.push(options.body);
    if (++attempt === 1) throw new TypeError('connection lost');
    return {message:{id:'m'},run:{id:'r',status:'queued'}};
  }, ()=>'request-1');
  await assert.rejects(send('c','same question'));
  await send('c','same question');
  assert.equal(bodies[0].requestId,bodies[1].requestId);
  assert.equal(bodies[1].content,'same question');
});

test('polling abort never invents a response', async () => {
  const controller=new AbortController(); controller.abort();
  await assert.rejects(waitForRun(async()=>({run:{status:'running'}}),'r',{signal:controller.signal}), error=>error.name==='AbortError');
});

test('CSRF token from authenticated session travels with JSON and multipart mutations', async () => {
  const calls=[];
  const api=createApi(async(path,init)=>{calls.push(init);return new Response(JSON.stringify(path.endsWith('me')?{user:{id:'u'},csrfToken:'csrf-1'}:{}));});
  await api('/api/auth/me');
  await api('/api/subjects',{method:'POST',body:{name:'数学'}});
  await api('/api/resources',{method:'POST',body:new FormData()});
  assert.equal(calls[1].headers['X-CSRF-Token'],'csrf-1');
  assert.equal(calls[2].headers['X-CSRF-Token'],'csrf-1');
  assert.equal(calls[2].headers['Content-Type'],undefined);
});

test('connection failures are recoverable user-facing errors, abort is preserved',async()=>{
  await assert.rejects(createApi(async()=>{throw new TypeError('Failed to fetch');})('/api/subjects'),error=>error.code==='NETWORK_ERROR'&&/连接/.test(error.message));
  await assert.rejects(createApi(async()=>{throw new DOMException('Aborted','AbortError');})('/api/subjects'),error=>error.name==='AbortError');
});

test('later login invalidates an earlier identity response before it can cache credentials',async()=>{
  let release;let headers;
  const api=createApi(async(path,options)=>{if(path.endsWith('/me'))return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({user:{id:'a'},csrfToken:'a-token'})));});if(path.endsWith('/login'))return new Response(JSON.stringify({user:{id:'b'},csrfToken:'b-token'}));headers=options.headers;return new Response('{}');});
  const stale=api('/api/auth/me');const rejection=assert.rejects(stale,error=>error.name==='AbortError');
  await api('/api/auth/login',{method:'POST',body:{username:'b',password:'test-only'}});release();await rejection;
  await api('/api/subjects',{method:'POST',body:{name:'b subject'}});assert.equal(headers['X-CSRF-Token'],'b-token');
});
