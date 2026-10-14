import test from 'node:test';
import assert from 'node:assert/strict';
import {loadState,saveState,STATE_KEY} from '../client/storage.js';
import {createInitialState,reduce} from '../client/model.js';
test('text state survives a browser storage roundtrip',()=>{const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};let s=loadState(storage);s=reduce(s,{type:'document.save',subjectId:'cpp',id:'loop',title:'更新',body:'中文正文'});saveState(s,storage);assert.deepEqual(loadState(storage),s);});
test('corrupt stored data is not silently replaced',()=>{const raw='{broken';let writes=0;assert.throws(()=>loadState({getItem:()=>raw,setItem:()=>writes++}));assert.equal(writes,0);});
test('quota error is propagated rather than claiming a save',()=>{assert.throws(()=>saveState(createInitialState(),{setItem:()=>{throw new Error('quota');}}),/quota/);});
