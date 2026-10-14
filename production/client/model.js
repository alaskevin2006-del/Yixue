export const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function weekDates(date) {
 const monday=new Date(date.getFullYear(),date.getMonth(),date.getDate());
 monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
 return Array.from({length:7},(_,i)=>new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i));
}
export function createInitialState(now=new Date()) {
 const today=dateKey(now);
 return {version:2,subjects:[{id:'cpp',name:'C++'},{id:'math',name:'高等数学'},{id:'ds',name:'数据结构'}],
 chats:[{id:'cpp-erase',subjectId:'cpp',title:'erase 后 iterator 为什么失效',messages:[{role:'user',content:'删掉元素后，为什么不能继续 ++it？'},{role:'assistant',content:'erase 会使被删位置及之后的 iterator 失效。删除后，应接住它返回的新 iterator。\n\nif (should_remove(*it)) {\n    it = v.erase(it);\n} else {\n    ++it;\n}\n\n删除时不再递增；保留元素时才递增。',sample:true}]},
 {id:'cpp-template',subjectId:'cpp',title:'模板参数推导',messages:[{role:'user',content:'为什么 typename T::value_type 推不出 T？'},{role:'assistant',content:'这是非推导上下文。可以比较显式指定 T 和让参数直接包含 T 的写法。',sample:true}]},
 {id:'cpp-virtual',subjectId:'cpp',title:'虚析构函数',messages:[{role:'user',content:'我只检查了派生类析构，忽略了通过 Base* 删除的情况。'},{role:'assistant',content:'下次可以先检查删除时使用的指针类型，再判断是否涉及多态删除。',sample:true}]},
 {id:'math-limits',subjectId:'math',title:'极限中的等价替换',messages:[{role:'user',content:'什么时候可以用等价无穷小替换？'}]}],
 documents:[{id:'loop',subjectId:'cpp',title:'循环删除时的 iterator 更新',body:'之前容易把删除与保留元素的两个分支混在一起。\n\n删除时接住 erase 返回的新 iterator；未删除时才递增。\n\n下次尝试连续删除两个相邻元素，检查是否跳过元素。',sourceId:'cpp-erase',updatedAt:today},
 {id:'deduction',subjectId:'cpp',title:'模板参数推导中的卡点',body:'嵌套类型不能直接反推出模板参数。\n\n还想用代码比较显式给出 T 与可推导参数的写法。',sourceId:'cpp-template',updatedAt:today}],
 agenda:[{id:'event-cpp',title:'C++ 循环删除练习',date:today,start:'15:30',end:'16:00'},{id:'event-meeting',title:'班会',date:today,start:'19:00',end:'20:00'}],
 planner:{texts:[{id:'plan-cpp',name:'C++',body:'这周想弄清 STL 容器的常用操作。\n目前对循环删除还不熟。\n下一步先做一道 erase 循环删除练习。'},{id:'plan-math',name:'高等数学',body:'准备本周的极限与连续习题。'}],chats:[{id:'plan-1',title:'今晚先推进什么',messages:[{role:'user',content:'今晚只有半小时，想再练一下 C++ 的 erase。'},{role:'assistant',content:'可以先做一道循环删除练习，重点检查 iterator 的更新。半小时不必覆盖所有容器。',sample:true}]}]}};
}
export function scoped(state, subjectId) {
 if(!state.subjects.some(s=>s.id===subjectId))throw new Error('学科不存在');
 return {chats:state.chats.filter(c=>c.subjectId===subjectId),documents:state.documents.filter(d=>d.subjectId===subjectId)};
}
function required(value,max=50000){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`请填写有效内容（不超过${max}字）`);return value.trim();}
function owned(items,id,subjectId){const x=items.find(x=>x.id===id);if(!x||x.subjectId!==subjectId)throw new Error('内容不属于当前学科');return x;}
export function reduce(original,a){
 const s=structuredClone(original), at=new Date().toISOString();
 switch(a.type){
 case 'subject.create': s.subjects.push({id:required(a.id,256),name:required(a.name,80)});break;
 case 'chat.create': scoped(s,a.subjectId);s.chats.unshift({id:required(a.id,256),subjectId:a.subjectId,title:'新对话',messages:[]});break;
 case 'chat.delete': owned(s.chats,a.id,a.subjectId);s.chats=s.chats.filter(c=>c.id!==a.id);break;
 case 'chat.restore': scoped(s,a.chat.subjectId);if(!s.chats.some(c=>c.id===a.chat.id))s.chats.unshift(a.chat);break;
 case 'message.add': {const c=owned(s.chats,a.id,a.subjectId);const content=required(a.content);c.messages.push({role:'user',content});if(c.title==='新对话')c.title=content.slice(0,32);break;}
 case 'document.save': {scoped(s,a.subjectId);const existing=s.documents.find(d=>d.id===a.id);if(existing)owned(s.documents,a.id,a.subjectId);
 const sourceId=existing?.sourceId??a.sourceId;if(sourceId&&!existing)owned(s.chats,sourceId,a.subjectId);
 const doc={...existing,id:required(a.id,256),subjectId:a.subjectId,title:required(a.title,160),body:required(a.body),sourceId,updatedAt:at};
 if(existing)s.documents[s.documents.indexOf(existing)]=doc;else s.documents.unshift(doc);break;}
 case 'document.delete': owned(s.documents,a.id,a.subjectId);s.documents=s.documents.filter(d=>d.id!==a.id);break;
 case 'document.restore': scoped(s,a.document.subjectId);if(!s.documents.some(d=>d.id===a.document.id))s.documents.unshift(a.document);break;
 case 'planner.create': s.planner.chats.unshift({id:required(a.id,256),title:'新对话',messages:[]});break;
 case 'planner.send': {const c=s.planner.chats.find(c=>c.id===a.id);if(!c)throw new Error('对话不存在');const content=required(a.content);c.messages.push({role:'user',content});if(c.title==='新对话')c.title=content.slice(0,32);break;}
 case 'planner.text': {const body=required(a.body),name=required(a.name,80);const i=s.planner.texts.findIndex(t=>t.id===a.id);const t={id:required(a.id,256),name,body};if(i<0)s.planner.texts.push(t);else s.planner.texts[i]=t;break;}
 case 'agenda.save': {const e={id:required(a.id,256),title:required(a.title,160),date:a.date,start:a.start,end:a.end};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.end)||e.end<=e.start)throw new Error('结束时间须晚于开始时间');
 const i=s.agenda.findIndex(x=>x.id===a.id);if(i<0)s.agenda.push(e);else s.agenda[i]=e;break;}
 case 'agenda.delete':s.agenda=s.agenda.filter(e=>e.id!==a.id);break;
 default:throw new Error('不支持的操作');
 }return s;
}
