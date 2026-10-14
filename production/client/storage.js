import { createInitialState } from './model.js';
export let STATE_KEY='yixue-user-prototype-v2';
let owner='';
export function fileDatabaseName(){return 'yixue-prototype-files'+(owner?':'+encodeURIComponent(owner):'');}
export function setStorageOwner(id){if(typeof id!=='string'||!id.trim())throw new Error('登录账号无效');owner=id;STATE_KEY='yixue-user-prototype-v2:'+encodeURIComponent(id);if(dbPromise)dbPromise.then(db=>db.close());dbPromise=null;}

export function loadState(storage=localStorage){
 const raw=storage.getItem(STATE_KEY);if(!raw)return createInitialState();
 const state=JSON.parse(raw);
 if(state?.version!==2||!Array.isArray(state.subjects)||!Array.isArray(state.documents)||!Array.isArray(state.chats)||!Array.isArray(state.agenda)||!Array.isArray(state.planner?.texts)||!Array.isArray(state.planner?.chats))throw new Error('浏览器中的数据无法读取。请先备份数据，不会自动覆盖。');
 return state;
}
export function saveState(state,storage=localStorage){storage.setItem(STATE_KEY,JSON.stringify(state));}
let dbPromise;
function database(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open(fileDatabaseName(),1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{dbPromise=null;reject(r.error);};});}
async function transaction(mode,work){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('files',mode);let value;const request=work(tx.objectStore('files'));request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('文件未保存'));});}
export const files={
 async list(domain,subjectId=null){return (await transaction('readonly',s=>s.getAll())).filter(f=>f.domain===domain&&(domain!=='private'||f.subjectId===subjectId));},
 async put(file){if(!['private','submission'].includes(file.domain)||!(file.blob instanceof Blob)||!file.id)throw new Error('无效文件');if(file.domain==='private'&&!file.subjectId)throw new Error('缺少所属学科');return transaction('readwrite',s=>s.put(file));},
 async get(id){return transaction('readonly',s=>s.get(id));},
 async delete(id){return transaction('readwrite',s=>s.delete(id));}
};
