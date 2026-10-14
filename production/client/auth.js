import {setSessionActive} from './session-state.js';
import {api} from './api.js';
import {setStorageOwner} from './storage.js';
const screen=document.querySelector('#login-screen'),app=document.querySelector('#signed-in-app'),form=document.querySelector('#login-form'),status=document.querySelector('#login-status'),error=document.querySelector('#login-error'),retry=document.querySelector('#login-retry'),exit=document.querySelector('#account-exit');
let user=null,checking=false,loaded=false,generation=0;
const basePath=new URL('../',import.meta.url).pathname;
const signalKey='yixue-auth-change:'+basePath;
function broadcast(){try{localStorage.setItem(signalKey,crypto.randomUUID());}catch{/* Session security does not depend on storage availability. */}}
function lock(message='请重新登录。'){
 generation++;api.resetSession();setSessionActive(false);user=null;app.hidden=true;screen.hidden=false;document.querySelector('main').replaceChildren();document.querySelector('#dialog').close();document.querySelector('#dialog').replaceChildren();document.querySelector('#notice').hidden=true;error.textContent=message;status.textContent='';form.querySelector('button').disabled=false;
}
async function enter(identity){
 if(identity.role==='admin'&&new URLSearchParams(location.search).get('view')!=='user'){location.replace(basePath+'admin/');return;}
 if(loaded){location.reload();return;}
 const token=generation;user=identity;setSessionActive(true);setStorageOwner(user.id);exit.title=user.username+' · 退出登录';
 try{const health=await api('/api/health');if(token!==generation)return;const badge=document.querySelector('.prototype-badge');badge.textContent=(health.environment==='test'?'测试环境 · ':health.environment==='local'?'本地环境 · ':'')+'服务器保存';await import('./main.js');loaded=true;if(token!==generation)return;screen.hidden=true;app.hidden=false;}
 catch{lock('页面未能加载，请重新连接。');retry.hidden=false;}
}
async function check(){
 if(checking)return;checking=true;const token=generation;
 try{const result=await api('/api/auth/me');if(token!==generation)return;if(user&&result.user.id!==user.id){lock('账号已在其他窗口切换，请重新登录。');return;}if(!loaded)await enter(result.user);}
 catch(e){if(e.name==='AbortError')return;if(e.status===401){lock(user?'登录已过期，请重新登录。':'');}else{lock('暂时无法连接服务器，请稍后重试。');retry.hidden=false;}}
 finally{checking=false;status.textContent='';form.querySelector('button').disabled=false;}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();const submit=form.querySelector('button');if(submit.disabled)return;submit.disabled=true;error.textContent='';status.textContent='正在登录…';
 try{const data=new FormData(form);await api('/api/auth/login',{method:'POST',body:{username:data.get('username'),password:data.get('password')}});form.reset();broadcast();location.reload();}
 catch(e){error.textContent=e.message;status.textContent='';submit.disabled=false;}
});
exit.addEventListener('click',async()=>{
 exit.disabled=true;try{await api('/api/auth/logout',{method:'POST'});lock('已退出登录。');broadcast();form.reset();}catch(e){lock('退出未完成：'+e.message);retry.hidden=false;}finally{exit.disabled=false;}
});
retry.addEventListener('click',()=>location.reload());
window.addEventListener('storage',event=>{if(event.key===signalKey)lock('账号登录状态已在其他窗口变化，请重新登录。');});
window.addEventListener('pageshow',event=>{if(event.persisted){lock('正在重新检查登录状态…');location.reload();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&user)check();});
setInterval(()=>{if(user)check();},60000);
// Main is loaded only after session verification. Lock also blocks old callbacks from UI events.
for(const type of ['click','submit','change','input'])document.addEventListener(type,event=>{if(!user&&event.target.closest('#signed-in-app')){event.preventDefault();event.stopImmediatePropagation();}},true);
check();
