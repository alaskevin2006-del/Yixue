import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { HttpError } from './errors.js';
import { bootstrapAdmin, createAuth } from './auth.js';
import { createCore } from './core.js';
import { serveFrontend } from './static.js';
import {initPlanner,handlePlanner} from './planner.js';

async function readJson(req){
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')throw new HttpError(415,'UNSUPPORTED_MEDIA_TYPE','请求须使用 JSON。');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size<=65536)chunks.push(chunk);}
  if(size>65536)throw new HttpError(413,'BODY_TOO_LARGE','请求内容超过 64 KiB。');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new HttpError(400,'MALFORMED_JSON','请求 JSON 无效。');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'INVALID_INPUT','请求内容须为对象。');
  return value;
}
function json(res,status,data,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(data===undefined?undefined:JSON.stringify(data));}
export async function createProductionServer(store,{config={},ai,handlers=[],contextHooks={}}={}){
  initPlanner(store);
  await bootstrapAdmin(store,config);
  const auth=createAuth(store,config),core=createCore(store,{config,ai,contextHooks});
  const server=createServer(async(req,res)=>{
    const requestId=randomUUID(),started=Date.now();
    res.setHeader('x-request-id',requestId);res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','DENY');res.setHeader('referrer-policy','same-origin');
    if(config.secureCookies)res.setHeader('strict-transport-security','max-age=31536000');
    res.on('finish',()=>config.logger?.({event:'request',requestId,method:req.method,status:res.statusCode,durationMs:Date.now()-started}));
    try{
      const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
      if(method==='GET'&&path==='/api/health'){store.get('SELECT 1 AS ok');json(res,200,{status:'ok',principalMode:'SESSION',persistence:'SQLITE',capabilities:{ai:!!ai?.configured,...(ai?.capabilities??{})}});return;}
      if(config.staticRoot&&!path.startsWith('/api/')){await serveFrontend(req,res,path,config.staticRoot);return;}
      const principal=auth.authenticate(req);let value;const body=()=>value??=readJson(req);
      const ctx={method,path,url,req,principal,store,config,body,ai,requestId};
      if(path!=='/api/auth/login'){
        if(!principal)throw new HttpError(401,'AUTH_REQUIRED','请先登录。');
        if(!['GET','HEAD','OPTIONS'].includes(method))auth.mutation(req);
      }
      let result=await auth.handle(ctx);
      if(!result)result=await core.handle(ctx);
      if(!result)result=await handlePlanner(ctx);
      if(!result){for(const handler of handlers){result=await handler(ctx);if(result)break;}}
      if(!result)throw new HttpError(404,'ROUTE_NOT_FOUND','此请求不受支持。');
      if(result.file){
        const info=await stat(result.file.path);const name=encodeURIComponent(result.file.name??'download');
        res.writeHead(result.status??200,{'content-type':result.file.mime??'application/octet-stream','content-length':info.size,'content-disposition':`${result.file.inline?'inline':'attachment'}; filename*=UTF-8''${name}`,'cache-control':'private, no-store',...result.headers});
        const stream=createReadStream(result.file.path);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      json(res,result.status??200,result.body,result.headers);
    }catch(error){
      req.resume();if(res.destroyed||res.headersSent)return;
      const sqlite=error.code?.startsWith('ERR_SQLITE'),busy=sqlite&&[5,6].includes(error.errcode);
      const status=error instanceof HttpError?error.status:busy?503:500,code=error instanceof HttpError?error.code:busy?'PERSISTENCE_BUSY':sqlite?'PERSISTENCE_ERROR':'INTERNAL_ERROR';
      config.logger?.({event:'request_error',requestId,status,code});json(res,status,{error:{code,message:error instanceof HttpError?error.message:'操作未完成，请稍后重试。',requestId}});
    }
  });
  server.requestTimeout=120000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
  server.drain=core.drain;server.abort=core.abort;
  return server;
}
