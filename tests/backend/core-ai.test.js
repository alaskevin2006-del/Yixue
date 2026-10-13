import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

async function adapter(){const module=await import('../../server/ai.js').catch(()=>null);assert.ok(module?.createAI,'real AI provider adapter must exist');return module.createAI;}
async function provider(t,handler){const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}/v1`;}

test('OpenAI-compatible adapter sends actual HTTP chat request and returns only actual provider content',async t=>{
  const createAI=await adapter();let received;
  const baseUrl=await provider(t,async(req,res)=>{assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers.authorization,'Bearer test-secret');let raw='';for await(const c of req)raw+=c;received=JSON.parse(raw);res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({choices:[{message:{role:'assistant',content:'真实服务回答'}}]}));});
  const ai=createAI({ai:{baseUrl,apiKey:'test-secret',model:'test-model',retries:0}});
  assert.equal(await ai.generate({purpose:'learning',system:'stable rules',messages:[{role:'user',content:'question'}]}),'真实服务回答');
  assert.equal(received.model,'test-model');assert.deepEqual(received.messages,[{role:'system',content:'stable rules'},{role:'user',content:'question'}]);assert.equal(received.stream,false);
  assert.equal(received.thinking,undefined);
});

test('compatible adapter sends thinking extension only when explicitly configured',async t=>{
  const createAI=await adapter(),received=[];
  const baseUrl=await provider(t,async(req,res)=>{let raw='';for await(const c of req)raw+=c;received.push(JSON.parse(raw));res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({choices:[{message:{role:'assistant',content:'actual endpoint reply'}}]}));});
  for(const thinking of ['disabled','enabled'])await createAI({ai:{baseUrl,apiKey:'test-secret',model:'test-model',thinking}}).generate({system:'stable rules',messages:[{role:'user',content:'question'}]});
  assert.deepEqual(received.map(body=>body.thinking),[{type:'disabled'},{type:'enabled'}]);
});

test('provider retry is bounded and raw errors never escape',async t=>{
  const createAI=await adapter();let calls=0;
  const baseUrl=await provider(t,(req,res)=>{calls++;req.resume();res.writeHead(503).end('provider leaked secret here');});
  const ai=createAI({ai:{baseUrl,apiKey:'test-secret',model:'test',retries:1,retryDelayMs:1}});
  await assert.rejects(ai.generate({system:'rules',messages:[{role:'user',content:'question'}]}),e=>e.code==='AI_PROVIDER_ERROR'&&!e.message.includes('secret'));
  assert.equal(calls,2);
});

test('unconfigured and invalid provider responses never produce fallback answers',async t=>{
  const createAI=await adapter();const absent=createAI({});assert.equal(absent.configured,false);
  await assert.rejects(absent.generate({system:'rules',messages:[]}),e=>e.code==='AI_NOT_CONFIGURED');
  const baseUrl=await provider(t,(req,res)=>{req.resume();res.writeHead(200).end(JSON.stringify({choices:[{message:{content:''}}]}));});
  await assert.rejects(createAI({ai:{baseUrl,apiKey:'x',model:'m',retries:0}}).generate({system:'rules',messages:[{role:'user',content:'q'}]}),e=>e.code==='AI_INVALID_RESPONSE');
});

test('provider timeout aborts request and explicit cancellation does not retry',async t=>{
  const createAI=await adapter();let calls=0;
  const baseUrl=await provider(t,(req,res)=>{calls++;req.resume();});
  const ai=createAI({ai:{baseUrl,apiKey:'x',model:'m',timeoutMs:30,retries:0}});
  await assert.rejects(ai.generate({system:'rules',messages:[{role:'user',content:'q'}]}),e=>e.code==='AI_TIMEOUT');
  const controller=new AbortController();controller.abort();
  await assert.rejects(ai.generate({system:'rules',messages:[{role:'user',content:'q'}],signal:controller.signal}),e=>e.code==='AI_CANCELLED');
  assert.equal(calls,1);
});
