// Run inside the isolated test container with project files in /tmp/yixue-real-files.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
if(process.env.YIXUE_ENVIRONMENT!=='test')throw Error('Test environment required');
const origin=process.env.YIXUE_ORIGIN,base=origin+'/test',root='/tmp/yixue-real-files';
const manifest=JSON.parse(await readFile(root+'/manifest.json','utf8'));
const credentials=JSON.parse(await readFile('/data/operations/test-account.json','utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');
async function login(username,password){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);const a=await r.json();return {user:a.user,headers:{origin,cookie:r.headers.get('set-cookie').split(';')[0],'x-csrf-token':a.csrfToken}};}
const user=await login(credentials.username,credentials.password),admin=await login(process.env.YIXUE_ADMIN_USERNAME,process.env.YIXUE_ADMIN_PASSWORD);
async function request(path,{data,method=data===undefined?'GET':'POST',who=user,expected=200}={}){const form=data instanceof FormData;const r=await fetch(base+path,{method,headers:{...who.headers,...(data===undefined||form?{}:{'content-type':'application/json'})},body:data===undefined?undefined:form?data:JSON.stringify(data),signal:AbortSignal.timeout(180000)});assert.equal(r.status,expected,path+' '+await (r.status===expected?Promise.resolve(''):r.text()));return r;}
const json=async(path,options)=>(await request(path,options)).json();
function form(file,bytes,fields={}){const f=new FormData();f.set('file',new Blob([bytes],{type:file.mime}),file.name);for(const [key,value]of Object.entries(fields))f.set(key,value);return f;}
const report={at:new Date().toISOString(),environment:'test',files:[],checks:{}};
try{
 const subject=(await json('/api/subjects',{data:{name:'真实文件验收 '+report.at.slice(0,10)},expected:201})).subject;report.subjectId=subject.id;
 for(const file of manifest){
  const bytes=await readFile(root+'/'+file.local);assert.equal(digest(bytes),file.sha256,'Source transport hash');
  const started=Date.now();const resource=(await json('/api/resources',{data:form(file,bytes,{subjectId:subject.id}),expected:201})).resource;
  const download=await request('/api/resources/'+resource.id+'/download');const saved=Buffer.from(await download.arrayBuffer());assert.equal(digest(saved),file.sha256);assert.ok(download.headers.get('content-disposition').includes(encodeURIComponent(file.name)),'Original filename');
  const content=await json('/api/resources/'+resource.id+'/content');
  if(file.mime.startsWith('text/'))assert.equal(content.content,bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(file.mime==='application/zip')assert.equal(content.extraction_status,'unsupported');
  const inspected=await request('/api/admin/users/'+user.user.id+'/resources/'+resource.id+'/download',{who:admin});assert.equal(digest(Buffer.from(await inspected.arrayBuffer())),file.sha256);
  await request('/api/admin/users/'+user.user.id+'/resources/'+resource.id+'/content',{who:admin,method:'PATCH',data:{content:'must not change'},expected:405});
  const anonymous=await fetch(base+'/api/resources/'+resource.id+'/download');assert.equal(anonymous.status,401);
  report.files.push({...file,id:resource.id,bytes:bytes.length,downloadHashMatch:true,originalFilename:true,extraction:content.extraction_status,pages:content.pages.length,extractedCharacters:content.content.length,error:content.error,elapsedMs:Date.now()-started});
  console.error('Verified '+file.name+' extraction='+content.extraction_status);
 }
 const md=manifest.find(f=>f.mime.startsWith('text/')),mdBytes=await readFile(root+'/'+md.local);
 const duplicate=(await json('/api/resources',{data:form(md,mdBytes,{subjectId:subject.id}),expected:201})).resource;
 assert.notEqual(duplicate.id,report.files.find(f=>f.name===md.name).id);report.checks.sameNameDoesNotOverwrite=true;
 const course=(await json('/api/courses',{who:admin,data:{name:'真实文件验收'},expected:201})).course;
 const pdf=manifest.find(f=>f.mime==='application/pdf'),pdfBytes=await readFile(root+'/'+pdf.local);
 const submission=(await json('/api/submissions',{data:form(pdf,pdfBytes,{courseId:course.id,description:'真实项目PDF审核与原件验收'}),expected:201})).submission;
 const review=await json('/api/submissions/'+submission.id+'/review',{who:admin,data:{decision:'accept',note:'原文件验收'}});
 const pub=await request('/api/resources/'+review.resource.id+'/download');assert.equal(digest(Buffer.from(await pub.arrayBuffer())),pdf.sha256);
 await request('/api/submissions/'+submission.id,{method:'DELETE',expected:204});
 const independent=await request('/api/resources/'+review.resource.id+'/download');assert.equal(digest(Buffer.from(await independent.arrayBuffer())),pdf.sha256);
 report.checks.submissionApproved=true;report.checks.publicCopySurvivesWithdrawal=true;report.publicResourceId=review.resource.id;
 report.checks.adminReadOnly=true;report.checks.anonymousDownloadDenied=true;
 const corrupt=new FormData();corrupt.set('file',new Blob(['not a PDF'],{type:'application/pdf'}),'伪装文件.pdf');await request('/api/resources',{data:corrupt,expected:415});report.checks.fakePdfRejected=true;
 const oversized=new FormData();oversized.set('file',new Blob([Buffer.alloc(20*1024*1024+1,65)],{type:'text/plain'}),'超限文件.txt');await request('/api/resources',{data:oversized,expected:413});report.checks.oversizedRejected=true;
 const again=await login(credentials.username,credentials.password);const listed=await json('/api/resources?subjectId='+subject.id,{who:again});for(const file of report.files)assert.ok(listed.resources.some(r=>r.id===file.id));report.checks.persistAfterRelogin=true;
 await request('/api/auth/logout',{who:again,data:{},expected:204});
}finally{
 for(const who of [user,admin])await fetch(base+'/api/auth/logout',{method:'POST',headers:who.headers}).catch(()=>{});
 console.log(JSON.stringify(report));
}
