export class ApiError extends Error {
  constructor(message, code, status, details = {}) {
    super(message); this.name = 'ApiError'; this.code = code; this.status = status;
    Object.assign(this, details);
  }
}
export function createApi(fetcher = globalThis.fetch) {
  let csrfToken = '', authGeneration = 0;
  const api = async function api(path, {method = 'GET', body, signal} = {}) {
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = body === undefined || multipart ? {} : {'Content-Type':'application/json'};
    if (csrfToken && !['GET','HEAD','OPTIONS'].includes(method) && path!=='/api/auth/login') headers['X-CSRF-Token']=csrfToken;
    // Starting a newer authentication action invalidates all earlier responses,
    // including identity checks that would otherwise overwrite the token cache.
    if(method==='POST'&&['/api/auth/login','/api/auth/logout'].includes(path)){
      authGeneration++;if(path==='/api/auth/login')csrfToken='';
    }
    const generation=authGeneration;
    const ensureCurrent=()=>{if(generation!==authGeneration)throw new DOMException('账户已变化','AbortError');};
    let response;
    try {response = await fetcher(apiPath(path), {method, credentials:'same-origin', signal,
      headers, body:body === undefined ? undefined : multipart ? body : JSON.stringify(body)});}
    catch(error){ensureCurrent();if(error.name==='AbortError')throw error;throw new ApiError('连接暂时中断，请检查网络后重试。','NETWORK_ERROR',0);}
    ensureCurrent();
    if (response.status === 204) {if(['/api/auth/logout','/api/auth/password'].includes(path))api.resetSession();return null;}
    let data;
    try { data = await response.json(); } catch { throw new ApiError('服务暂时无法响应，请稍后重试。', 'INVALID_RESPONSE', response.status); }
    ensureCurrent();
    if (!response.ok) throw new ApiError(data.error?.message || '操作失败，请重试。', data.error?.code, response.status, data.error || {});
    if (data.csrfToken&&['/api/auth/login','/api/auth/me'].includes(path)) csrfToken=data.csrfToken;
    return data;
  };
  api.resetSession=()=>{authGeneration++;csrfToken='';};
  api.blob=async function(path){
    const generation=authGeneration;
    const response=await fetcher(apiPath(path),{credentials:'same-origin'});
    const ensure=()=>{if(generation!==authGeneration)throw new DOMException('账户已变化','AbortError');};
    ensure();if(!response.ok){const data=await response.json().catch(()=>({}));ensure();throw new ApiError(data.error?.message||'文件下载失败',data.error?.code,response.status);}
    const blob=await response.blob();ensure();return blob;
  };
  return api;
}
export function apiPath(path){
  if(!path.startsWith('/api/'))throw new Error('Unsupported API path');
  const base=typeof location==='undefined'?'':new URL('../',import.meta.url).pathname.replace(/\/$/,'');
  return base+path;
}
export const api = createApi();
export const id = value => encodeURIComponent(value);
