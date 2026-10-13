import { setTimeout as delay } from 'node:timers/promises';
import { HttpError } from './errors.js';

export function createAI(config={}) {
  const settings=config.ai??{},configured=!!(settings.baseUrl&&settings.apiKey&&settings.model);
  let endpoint;
  if(configured){
    const url=new URL(settings.baseUrl);
    if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('INVALID_AI_BASE_URL');
    endpoint=url.href.replace(/\/$/,'');if(!endpoint.endsWith('/chat/completions'))endpoint+='/chat/completions';
  }
  let active=0;
  return{
    configured,capabilities:{vision:configured&&!!settings.vision},
    async generate({messages,system,signal}){
      if(!configured)throw new HttpError(503,'AI_NOT_CONFIGURED','AI 服务尚未配置。');
      if(signal?.aborted)throw new HttpError(499,'AI_CANCELLED','AI 请求已取消。');
      if(active>=(settings.maxConcurrent??6))throw new HttpError(429,'AI_RATE_LIMIT','AI 请求较多，请稍后重试。');
      if(!Array.isArray(messages)||messages.length>100||typeof system!=='string')throw new HttpError(400,'INVALID_AI_INPUT','AI 请求上下文无效。');
      const payload=JSON.stringify({model:settings.model,messages:[{role:'system',content:system},...messages],stream:false,max_tokens:settings.maxOutputTokens??4096,...(settings.thinking!==undefined?{thinking:{type:settings.thinking}}:{})});
      if(Buffer.byteLength(payload)>32*1024*1024)throw new HttpError(413,'AI_CONTEXT_TOO_LARGE','AI 请求内容过大。');
      active++;
      try{
        const retries=Math.min(2,Math.max(0,settings.retries??1));
        for(let attempt=0;attempt<=retries;attempt++){
          const timeout=AbortSignal.timeout(settings.timeoutMs??60000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
          try{
            const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${settings.apiKey}`},body:payload,signal:combined});
            if(!response.ok){await response.body?.cancel();const transient=response.status===429||response.status>=500;
              if(transient&&attempt<retries){await delay(settings.retryDelayMs??500,undefined,{signal});continue;}
              throw new HttpError(response.status===429?429:502,response.status===429?'AI_RATE_LIMIT':'AI_PROVIDER_ERROR','AI 服务未能完成请求。');
            }
            let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw new HttpError(502,'AI_INVALID_RESPONSE','AI 返回内容无效。');chunks.push(chunk);}
            let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(502,'AI_INVALID_RESPONSE','AI 返回内容无效。');}
            const value=data?.choices?.[0]?.message?.content;
            if(typeof value!=='string'||!value.trim()||value.length>64000)throw new HttpError(502,'AI_INVALID_RESPONSE','AI 未返回有效回答。');
            return value;
          }catch(error){
            if(signal?.aborted)throw new HttpError(499,'AI_CANCELLED','AI 请求已取消。');
            if(timeout.aborted)throw new HttpError(504,'AI_TIMEOUT','AI 请求超时，可重试。');
            if(error instanceof HttpError)throw error;
            if(attempt<retries){try{await delay(settings.retryDelayMs??500,undefined,{signal});}catch{throw new HttpError(499,'AI_CANCELLED','AI 请求已取消。');}continue;}
            throw new HttpError(502,'AI_PROVIDER_ERROR','AI 服务未能完成请求。');
          }
        }
      }finally{active--;}
    }
  };
}
