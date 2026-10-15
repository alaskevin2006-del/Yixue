import {randomUUID} from 'node:crypto';
import {HttpError} from './errors.js';
import {prepareProposal,applyProposal,confirmation,cancellation,plannerPrompt} from './planner-actions.js';
const fail=(status,code,message)=>{throw new HttpError(status,code,message);};
const locks=new WeakMap();
export function initPlanner(store){store.db.exec('CREATE TABLE IF NOT EXISTS planner_records (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES user_principals(id), kind TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL) STRICT; CREATE INDEX IF NOT EXISTS planner_owner ON planner_records(owner_id,kind);');}
function text(value,max=12000,empty=false){if(typeof value!=='string'||value.length>max||value.includes('\0')||(!empty&&!value.trim()))fail(400,'INVALID_INPUT','请输入有效内容。');return value.trim();}
function view(row){return {...JSON.parse(row.data),id:row.id,kind:row.kind,version:row.version,updatedAt:row.updated_at};}
function owned(store,owner,id){const row=store.get('SELECT * FROM planner_records WHERE id=? AND owner_id=?',id,owner);if(!row)fail(404,'NOT_FOUND','记录不存在或无权访问。');return row;}
function write(store,row,data){store.run('UPDATE planner_records SET data=?,version=version+1,updated_at=? WHERE id=?',JSON.stringify(data),new Date().toISOString(),row.id);return view(owned(store,row.owner_id,row.id));}
function fields(kind,b){const title=text(b.title,160);if(kind==='text')return{title,content:text(b.content??'',50000,true)};if(kind==='chat')return{title,messages:[]};if(kind==='agenda'){const date=text(b.date,10),start=text(b.start,5),end=text(b.end,5);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<=start||!Number.isFinite(new Date(date+'T12:00:00Z').valueOf())||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail(400,'INVALID_SCHEDULE','请检查日期和起止时间。');return{title,date,start,end};}fail(400,'INVALID_KIND','不支持的记录类型。');}
export async function handlePlanner({method,path,body,store,principal,ai}){
 if(!path.startsWith('/api/planner'))return null;
 const owner=principal.id,reply=(body,status=200)=>({body,status});
 if(path==='/api/planner'&&method==='GET')return reply({records:store.all('SELECT * FROM planner_records WHERE owner_id=? ORDER BY updated_at DESC,id',owner).map(view)});
 if(path==='/api/planner/records'&&method==='POST'){const b=await body();const data=fields(b.kind,b);if(store.get('SELECT COUNT(*) n FROM planner_records WHERE owner_id=?',owner).n>=2000)fail(409,'LIMIT','记录数量已达上限。');const id=randomUUID();store.run('INSERT INTO planner_records VALUES (?,?,?,?,1,?)',id,owner,b.kind,JSON.stringify(data),new Date().toISOString());return reply({record:view(owned(store,owner,id))},201);}
 let m=path.match(/^\/api\/planner\/records\/([^/]+)$/);
 if(m){let row=owned(store,owner,decodeURIComponent(m[1]));if(method==='DELETE'){store.run('DELETE FROM planner_records WHERE id=?',row.id);return reply(undefined,204);}if(method==='PATCH'){const b=await body();row=owned(store,owner,row.id);if(b.version!==row.version)fail(409,'VERSION_CONFLICT','记录已更新，请重新打开后编辑。');if(row.kind==='chat')fail(400,'INVALID_ACTION','对话内容由发送消息操作保存。');return reply({record:write(store,row,fields(row.kind,b))});}}
 m=path.match(/^\/api\/planner\/chats\/([^/]+)\/messages$/);
 if(m&&method==='POST'){
  let row=owned(store,owner,decodeURIComponent(m[1]));if(row.kind!=='chat')fail(400,'INVALID_KIND','请选择规划对话。');const b=await body(),content=text(b.content),requestId=text(b.requestId,128);
  let active=locks.get(store);if(!active){active=new Set();locks.set(store,active);}if(active.has(row.id))fail(409,'CHAT_BUSY','这段对话正在回答，请稍后再试。');active.add(row.id);
  try{
   row=owned(store,owner,row.id);
   let data=JSON.parse(row.data);const previous=data.messages.find(x=>x.role==='user'&&x.requestId===requestId);
   if(previous&&(previous.content!==content||previous.proposalId!==b.proposalId))fail(409,'REQUEST_CONFLICT','重试内容与原消息不一致。');
   if(data.messages.some(x=>x.role==='assistant'&&x.requestId===requestId))return reply({record:view(row)});
   if(!previous){if(data.messages.length>=1000)fail(409,'CHAT_LIMIT','请新建一段规划对话。');data.messages.push({role:'user',content,requestId,proposalId:b.proposalId});if(data.messages.length===1)data.title=content.slice(0,40);write(store,row,data);}
   if(confirmation(content)||cancellation(content)){
    let answer;
    try{store.transaction(()=>{
     const latest=owned(store,owner,row.id);data=JSON.parse(latest.data);
     if(data.proposal?.status==='pending'){
      if(b.proposalId!==data.proposal.id){answer='待确认内容已变化，本次未执行。请查看最新操作后再确认。';}
      else if(cancellation(content)){data.proposal.status='cancelled';answer='已取消，没有修改日程或规划笔记。';}
      else{answer=applyProposal(store,owner,data.proposal);data.proposal.status='executed';}
     }else answer=data.proposal?.status==='executed'?'这批操作已经执行，没有重复保存。':'当前没有待确认操作，没有修改任何内容。';
     data.messages.push({role:'assistant',content:answer,requestId});write(store,latest,data);
    });}catch(error){if(error.code!=='PROPOSAL_INVALID')throw error;const latest=owned(store,owner,row.id);data=JSON.parse(latest.data);if(data.proposal)data.proposal.status='expired';data.messages.push({role:'assistant',content:error.message,requestId});write(store,latest,data);}
    return reply({record:view(owned(store,owner,row.id))});
   }
   // Any new request supersedes the old proposal, including when generation fails.
   if(data.proposal?.status==='pending'){data.proposal.status='superseded';write(store,owned(store,owner,row.id),data);}
   if(!ai?.configured)fail(503,'AI_NOT_CONFIGURED','AI 服务尚未配置，问题已保存。');
   const records=store.all("SELECT * FROM planner_records WHERE owner_id=? AND kind IN ('text','agenda') ORDER BY updated_at DESC,id",owner).map(view);
   const answer=await ai.generate({purpose:'planner',messages:data.messages.slice(-40).map(({role,content})=>({role,content})),system:plannerPrompt(records)});
   const latest=owned(store,owner,row.id);data=JSON.parse(latest.data);let prepared;
   try{prepared=prepareProposal(answer,records,fields);}catch(error){if(!(error instanceof HttpError))throw error;prepared={reply:error.message};}
   if(prepared.proposal)data.proposal=prepared.proposal;
   data.messages.push({role:'assistant',content:text(prepared.reply,50000),requestId});return reply({record:write(store,latest,data)});
  }finally{active.delete(row.id);}
 }
 return null;
}
