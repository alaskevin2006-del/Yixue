import test from 'node:test';
import assert from 'node:assert/strict';
import {setStorageOwner,loadState,saveState,STATE_KEY,fileDatabaseName} from '../client/storage.js';
test('account-specific browser state never imports another account or unowned legacy data',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 map.set('yixue-user-prototype-v2','legacy must stay untouched');
 setStorageOwner('account-a');const a=loadState(storage);a.subjects.push({id:'private-a',name:'A only'});saveState(a,storage);const aKey=STATE_KEY,dbA=fileDatabaseName();
 setStorageOwner('account-b');assert.notEqual(STATE_KEY,aKey);assert.notEqual(fileDatabaseName(),dbA);assert(!loadState(storage).subjects.some(s=>s.id==='private-a'));
 setStorageOwner('account-a');assert(loadState(storage).subjects.some(s=>s.id==='private-a'));assert.equal(map.get('yixue-user-prototype-v2'),'legacy must stay untouched');
 assert.throws(()=>setStorageOwner(''));
});
