import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat,readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { HttpError } from './errors.js';
import { bootstrapAdmin, createAuth } from './auth.js';
import { createCore } from './core.js';
import { serveFrontend } from './static.js';
import {initPlanner,handlePlanner} from './planner.js';
import {initAdmin,handleAdmin} from './admin.js';
import {initWorkspace,handleWorkspace} from './workspace.js';

async function readJson(req,maxBytes=65536){
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')throw new HttpError(415,'UNSUPPORTED_MEDIA_TYPE','请求须使用 JSON。');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size<=maxBytes)chunks.push(chunk);}
  if(size>maxBytes)throw new HttpError(413,'BODY_TOO_LARGE',`请求内容超过 ${maxBytes/1024} KiB。`);
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new HttpError(400,'MALFORMED_JSON','请求 JSON 无效。');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'INVALID_INPUT','请求内容须为对象。');
  return value;
}
function json(res,status,data,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(data===undefined?undefined:JSON.stringify(data));}
export async function createProductionServer(store,{config={},ai,handlers=[],contextHooks={}}={}){
  initPlanner(store);
  initAdmin(store);initWorkspace(store);
  await bootstrapAdmin(store,config);
  const auth=createAuth(store,config),core=createCore(store,{config,ai,contextHooks});
  const requests=new Map();
  const server=createServer(async(req,res)=>{
    const requestId=randomUUID(),started=Date.now();
    res.setHeader('x-request-id',requestId);res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','DENY');res.setHeader('referrer-policy','same-origin');
    if(config.secureCookies)res.setHeader('strict-transport-security','max-age=31536000');
    res.on('finish',()=>config.logger?.({event:'request',requestId,method:req.method,status:res.statusCode,durationMs:Date.now()-started}));
    try{
      const url=new URL(req.url,'http://localhost');let path=url.pathname;const method=req.method;
      if(config.basePath){if(path===config.basePath){res.writeHead(302,{location:config.basePath+'/'}).end();return;}if(path.startsWith(config.basePath+'/')){path=path.slice(config.basePath.length);url.pathname=path;}}
      if(method==='GET'&&path==='/api/health'){store.get('SELECT 1 AS ok');json(res,200,{status:'ok',environment:config.environment??'production',principalMode:'SESSION',persistence:'SQLITE',capabilities:{ai:!!ai?.configured,...(ai?.capabilities??{})}});return;}
      if(config.staticRoot&&!path.startsWith('/api/')){await serveFrontend(req,res,path,config.staticRoot);return;}
      const principal=auth.authenticate(req);let value;const largeDocument=/^\/api\/(?:memories\/[^/]+|planner\/records(?:\/[^/]+)?|workspace\/import)$/.test(path);const body=()=>value??=readJson(req,largeDocument?262144:65536);
      const rateKey=principal?.id??req.socket.remoteAddress,at=Date.now();
      let limit=requests.get(rateKey);if(!limit||limit.until<at){limit={count:0,until:at+60000};requests.set(rateKey,limit);}
      if(++limit.count>(config.requestsPerMinute??600)){res.setHeader('retry-after',Math.ceil((limit.until-at)/1000));throw new HttpError(429,'RATE_LIMIT','请求过于频繁，请稍后重试。');}
      if(requests.size>10000){for(const [key,v] of requests)if(v.until<at)requests.delete(key);if(requests.size>10000)requests.delete(requests.keys().next().value);}
      const ctx={method,path,url,req,principal,store,config,body,ai,requestId};
      if(path!=='/api/auth/login'){
        if(!principal)throw new HttpError(401,'AUTH_REQUIRED','请先登录。');
        if(!['GET','HEAD','OPTIONS'].includes(method))auth.mutation(req);
      }
      let result=await auth.handle(ctx);
      if(!result&&path==='/api/admin/operations'&&method==='GET'){
        if(principal.role!=='admin')throw new HttpError(403,'ADMIN_REQUIRED','此操作需要管理员权限。');
        let report=null;try{if(config.operationsStatusPath)report=JSON.parse(await readFile(config.operationsStatusPath,'utf8'));}catch{}
        result={body:{report,stale:!report?.checkedAt||Date.now()-Date.parse(report.checkedAt)>15*60000,limits:{userBytes:config.userQuotaBytes??1024**3,totalBytes:config.totalStorageBytes??20*1024**3,fileBytes:config.maxUploadBytes??20*1024**2}}};
      }
      if(!result)result=await handleAdmin(ctx);
      if(!result)result=await core.handle(ctx);
      if(!result)result=await handlePlanner(ctx);
      if(!result)result=await handleWorkspace(ctx);
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
