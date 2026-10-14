import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, scoped, weekDates, dateKey } from '../client/model.js';

test('subject conversations and documents remain scoped, including forged IDs', () => {
  let s = createInitialState(new Date(2026, 9, 14));
  s = reduce(s, {type:'chat.create', subjectId:'math', id:'math-chat'});
  assert(scoped(s,'math').chats.every(c=>c.subjectId==='math'));
  assert(!scoped(s,'cpp').chats.some(c=>c.id==='math-chat'));
  assert.throws(()=>reduce(s,{type:'message.add',subjectId:'math',id:'cpp-erase',content:'wrong'}));
  assert.throws(()=>reduce(s,{type:'document.save',subjectId:'math',id:'loop',title:'wrong',body:'wrong'}));
});
test('document save, delete and restore preserve source and other subjects', () => {
  let s=createInitialState();
  const before=structuredClone(s.documents.find(d=>d.id==='loop'));
  s=reduce(s,{type:'document.save',subjectId:'cpp',id:'loop',title:'我的记录',body:'新的认识'});
  assert.equal(scoped(s,'cpp').documents.find(d=>d.id==='loop').body,'新的认识');
  assert.equal(s.documents.find(d=>d.id==='loop').sourceId,before.sourceId);
  const saved=s.documents.find(d=>d.id==='loop');
  s=reduce(s,{type:'document.delete',subjectId:'cpp',id:'loop'});
  assert(!scoped(s,'cpp').documents.some(d=>d.id==='loop'));
  s=reduce(s,{type:'document.restore',document:saved});
  assert.equal(s.documents.find(d=>d.id==='loop').body,'新的认识');
});
test('planning conversation and agenda never update planning text or learning memory', () => {
  let s=createInitialState(); const text=structuredClone(s.planner.texts), docs=structuredClone(s.documents);
  s=reduce(s,{type:'planner.send',id:'plan-1',content:'我完成了所有任务'});
  s=reduce(s,{type:'agenda.save',id:'new',title:'练习',date:'2026-10-14',start:'14:00',end:'14:30'});
  assert.deepEqual(s.planner.texts,text); assert.deepEqual(s.documents,docs);
  assert.equal(s.planner.chats[0].messages.at(-1).role,'user');
  s=reduce(s,{type:'planner.text',id:'plan-cpp',name:'C++',body:'用户确认的新文本'});
  assert.deepEqual(s.documents,docs);
  assert.equal(s.planner.texts[0].body,'用户确认的新文本');
});
test('failed validation leaves original state unchanged; no empty docs or reversed times',()=>{
 const s=createInitialState(), copy=structuredClone(s);
 assert.throws(()=>reduce(s,{type:'document.save',subjectId:'cpp',id:'loop',title:' ',body:'x'}));
 assert.throws(()=>reduce(s,{type:'agenda.save',id:'bad',date:'2026-10-14',title:'x',start:'15:00',end:'14:00'}));
 assert.deepEqual(s,copy);
});
test('week containing Sunday starts preceding Monday and handles month boundary',()=>{
 assert.deepEqual(weekDates(new Date(2026,10,1)).map(dateKey),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
});
test('retaining a candidate twice updates one document and does not change planner',()=>{
 let s=createInitialState(); const p=structuredClone(s.planner);
 const a={type:'document.save',subjectId:'cpp',id:'candidate-virtual',title:'个人卡点',body:'忽略了Base指针',sourceId:'cpp-virtual'};
 s=reduce(reduce(s,a),{...a,body:'修改后'});
 assert.equal(s.documents.filter(d=>d.id===a.id).length,1);assert.deepEqual(s.planner,p);
});
