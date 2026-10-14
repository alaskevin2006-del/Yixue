import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../../server/store.js';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { zipSync } from 'fflate';
import { extractResource } from '../../server/resource-extract.js';

function pdfFixture(text=null) {return pdfPages([text]);}
function pdfPages(texts) {
  const font=3+2*texts.length;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${texts.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${texts.length} >>`];
  texts.forEach((text,i)=>{const stream=text===null?'':'BT /F1 12 Tf 30 100 Td ('+text+') Tj ET';objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4+i*2} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);});objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let data='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(data);
  data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(data);
}
import { initResources, handleResources, getReferenceContext } from '../../server/resources.js';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(),'yixue-resources-'));
  let store = new Store(path.join(dir,'test.sqlite'));
  store.db.exec(`INSERT INTO user_principals VALUES ('u1','2026'),('u2','2026'); INSERT INTO subjects(id,owner_user_id,name,created_at,updated_at) VALUES ('s1','u1','Math','2026','2026'),('s2','u2','Physics','2026','2026'); INSERT INTO conversations(id,subject_space_id,title,created_at,updated_at) VALUES ('c1','s1','One','2026','2026'),('c2','s2','Two','2026','2026'),('c3','s1','Three','2026','2026');`);
  const config={uploadsDir:path.join(dir,'uploads')};
  await initResources(store,config);
  t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
  const principals={u1:{id:'u1',role:'user'},u2:{id:'u2',role:'user'},admin:{id:'a',role:'admin'}};
  async function call(method,route,body={},who='u1',ai) {const url=new URL(route,'http://test');return handleResources({method,path:url.pathname,url,principal:principals[who],store,config,body:async()=>body,ai});}
  async function upload(route,text='Only explicit material',fields={},who='u1',filename='lesson.txt',mime='text/plain',ai={configured:false}) {
    const boundary='testboundary123';
    let head=Object.entries(fields).map(([k,v])=>`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join('');
    head+=`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`;
    const bytes=Buffer.concat([Buffer.from(head),Buffer.isBuffer(text)?text:Buffer.from(text),Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const req=Readable.from([bytes]);req.headers={'content-type':`multipart/form-data; boundary=${boundary}`};
    return handleResources({method:'POST',path:route,url:new URL(route,'http://test'),principal:principals[who],store,config,req,ai});
  }
  return {get store(){return store;},config,call,upload,principals,restart(){store.close();store=new Store(path.join(dir,'test.sqlite'));initResources(store,config);}};
}

test('private upload persists actual extracted text and denies another tenant',async t=>{
  const f=await fixture(t);const {resource}= (await f.upload('/api/resources','Euler formula',{subjectId:'s1'})).body;
  assert.equal(resource.scope,'private');assert.equal(resource.subject_id,'s1');assert.equal(resource.extraction_status,'ready');
  assert.equal((await f.call('GET',`/api/resources/${resource.id}/content`)).body.content,'Euler formula');
  assert.equal((await f.call('GET','/api/resources',{},'u2')).body.resources.length,0);
  await assert.rejects(f.call('GET',`/api/resources/${resource.id}/download`,{},'u2'),{status:404});
  await assert.rejects(f.call('PATCH',`/api/resources/${resource.id}`,{subjectId:'s2'}),{status:404});
  const download=await f.call('GET',`/api/resources/${resource.id}/download`);assert.equal(await readFile(download.file.path,'utf8'),'Euler formula');
});

test('browser UTF8 multipart filenames remain Chinese in private and submission names/downloads',async t=>{
  const f=await fixture(t);const filename='高等数学·复习笔记.txt';
  const {resource}=(await f.upload('/api/resources','中文正文',{},'u1',filename)).body;
  assert.equal(resource.name,filename);assert.equal(resource.original_name,filename);
  assert.equal((await f.call('GET',`/api/resources/${resource.id}/download`)).file.name,filename);
  const {course}=(await f.call('POST','/api/courses',{name:'高等数学'},'admin')).body;
  const {submission}=(await f.upload('/api/submissions','中文投稿',{courseId:course.id},'u1',filename)).body;
  assert.equal(submission.name,filename);assert.equal(submission.original_name,filename);
  assert.equal((await f.call('GET',`/api/submissions/${submission.id}/download`)).file.name,filename);
});

test('delayed reference request cannot write references after conversation deletion',async t=>{
  const f=await fixture(t);const {resource}=(await f.upload('/api/resources','Deleted conversation evidence')).body;
  let release;const pending=handleResources({method:'PUT',path:'/api/conversations/c1/references',url:new URL('http://test/api/conversations/c1/references'),principal:f.principals.u1,store:f.store,config:f.config,body:()=>new Promise(resolve=>{release=resolve;})});
  f.store.run('UPDATE conversations SET deleted_at=? WHERE id=?','2026','c1');
  release({references:[{resourceId:resource.id}]});await assert.rejects(pending,{status:404});
  assert.equal(f.store.all('SELECT * FROM resource_references WHERE conversation_id=?','c1').length,0);
});

test('late upload extraction cannot recreate deleted resource content',async t=>{
  const f=await fixture(t);const png=Buffer.from([137,80,78,71,13,10,26,10,...Array(30).fill(0)]);
  let complete,started;const began=new Promise(resolve=>{started=resolve;});
  const ai={configured:true,capabilities:{vision:true},generate(){started();return new Promise(resolve=>{complete=resolve;});}};
  const uploading=f.upload('/api/resources',png,{},'u1','延迟图片.png','image/png',ai);await began;
  const id=f.store.get('SELECT id FROM resources WHERE deleted_at IS NULL').id;
  await f.call('DELETE',`/api/resources/${id}`);complete('Delayed original OCR text');await assert.rejects(uploading,{status:404});
  assert.equal(f.store.all('SELECT * FROM resource_pages WHERE resource_id=?',id).length,0);
  await assert.rejects(f.call('GET',`/api/resources/${id}/content`),{status:404});
});

test('references are explicit per conversation and deletion revokes extracted content',async t=>{
  const f=await fixture(t);const {resource}=(await f.upload('/api/resources','secret evidence')).body;
  assert.equal(getReferenceContext(f.store,f.principals.u1,'c1',f.config).content,'');
  await f.call('PUT','/api/conversations/c1/references',{references:[{resourceId:resource.id}]});
  assert.match(getReferenceContext(f.store,f.principals.u1,'c1',f.config).content,/secret evidence/);
  assert.equal(getReferenceContext(f.store,f.principals.u1,'c3',f.config).content,'');
  await assert.rejects(f.call('PUT','/api/conversations/c2/references',{references:[{resourceId:resource.id}]},'u2'),{status:404});
  await f.call('DELETE',`/api/resources/${resource.id}`);
  const context=getReferenceContext(f.store,f.principals.u1,'c1',f.config);assert.doesNotMatch(context.content,/secret evidence/);assert.equal(context.references[0].available,false);
  assert.equal(f.store.all('SELECT * FROM resource_pages WHERE resource_id=?',resource.id).length,0);
  await assert.rejects(f.call('GET',`/api/resources/${resource.id}/download`),{status:404});
});

test('submission acceptance creates independent public copy and is idempotent',async t=>{
  const f=await fixture(t);const {course}=(await f.call('POST','/api/courses',{name:'Calculus'},'admin')).body;
  const {submission}=(await f.upload('/api/submissions','Shared lecture',{courseId:course.id})).body;
  assert.equal((await f.call('GET','/api/resources?scope=public')).body.resources.length,0);
  await assert.rejects(f.call('POST',`/api/submissions/${submission.id}/review`,{decision:'accept'}),{status:403});
  const accepted=(await f.call('POST',`/api/submissions/${submission.id}/review`,{decision:'accept'},'admin')).body;
  const repeat=(await f.call('POST',`/api/submissions/${submission.id}/review`,{decision:'accept'},'admin')).body;
  assert.equal(accepted.resource.id,repeat.resource.id);assert.notEqual(accepted.resource.id,submission.id);
  const publicDownload=await f.call('GET',`/api/resources/${accepted.resource.id}/download`,{},'u2');
  const submissionDownload=await f.call('GET',`/api/submissions/${submission.id}/download`);
  assert.notEqual(publicDownload.file.path,submissionDownload.file.path);
  assert.equal(f.store.get('SELECT resource_id FROM public_resources WHERE resource_id=?',accepted.resource.id).resource_id,accepted.resource.id);
  const own=(await f.upload('/api/resources','Shared lecture')).body.resource;
  assert.equal(f.store.get('SELECT resource_id FROM private_resources WHERE resource_id=?',own.id).resource_id,own.id);
  assert.throws(()=>f.store.run('UPDATE resources SET scope=? WHERE id=?','public',own.id));
  await f.call('DELETE',`/api/resources/${own.id}`);
  assert.equal(await readFile(publicDownload.file.path,'utf8'),'Shared lecture');
  await f.call('DELETE',`/api/resources/${accepted.resource.id}`,{},'admin');
  assert.equal(await readFile(submissionDownload.file.path,'utf8'),'Shared lecture');
  assert.equal((await f.call('GET','/api/submissions')).body.submissions[0].status,'accepted');
  await assert.rejects(f.call('POST',`/api/submissions/${submission.id}/review`,{decision:'reject'},'admin'),{status:409});
});

test('startup completes interrupted resource deletion without retaining extracted source or file',async t=>{
  const f=await fixture(t);const {resource}=(await f.upload('/api/resources','Original source')).body;
  const download=await f.call('GET',`/api/resources/${resource.id}/download`);
  f.store.run('UPDATE resources SET deleted_at=? WHERE id=?','2026',resource.id);f.restart();
  assert.equal(f.store.all('SELECT * FROM resource_pages WHERE resource_id=?',resource.id).length,0);
  await assert.rejects(readFile(download.file.path),{code:'ENOENT'});
});

test('rejects executable masquerading as PDF, excess size, foreign subject and forged paths',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.upload('/api/resources','MZbad',{},'u1','bad.pdf','application/pdf'),{status:415});
  f.config.maxUploadBytes=3;await assert.rejects(f.upload('/api/resources','too large'),{status:413});f.config.maxUploadBytes=20*1024*1024;
  await assert.rejects(f.upload('/api/resources','abc',{subjectId:'s2'}),{status:404});
  const {resource}=(await f.upload('/api/resources','hello')).body;f.store.run('UPDATE resources SET storage_key=? WHERE id=?','../outside',resource.id);
  await assert.rejects(f.call('GET',`/api/resources/${resource.id}/download`),{status:500});
});

test('upload cap accepts exactly the limit and deletion physically removes original file',async t=>{
  const f=await fixture(t);f.config.maxUploadBytes=3;
  const {resource}=(await f.upload('/api/resources','abc')).body;
  const download=await f.call('GET',`/api/resources/${resource.id}/download`);
  await f.call('DELETE',`/api/resources/${resource.id}`);
  await assert.rejects(readFile(download.file.path),{code:'ENOENT'});
});

test('ZIP stays downloadable and unread, images require configured vision',async t=>{
  const f=await fixture(t);
  const zip=Buffer.from([0x50,0x4b,0x05,0x06,...Array(18).fill(0)]);
  const {resource}=(await f.upload('/api/resources',zip,{},'u1','archive.zip','application/zip')).body;
  assert.equal(resource.extraction_status,'unsupported');assert.equal((await f.call('GET',`/api/resources/${resource.id}/content`)).body.content,'');
  const png=Buffer.from([137,80,78,71,13,10,26,10,...Array(30).fill(0)]);
  const photo=(await f.upload('/api/resources',png,{},'u1','scan.png','image/png')).body.resource;
  assert.equal(photo.extraction_status,'needs_vision');
});

test('DOCX paragraphs and PPTX presentation order are actually extracted',async t=>{
  const f=await fixture(t);
  const docx=zipSync({'word/document.xml':Buffer.from('<w:document><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:document>')});
  const {resource}=(await f.upload('/api/resources',docx,{},'u1','notes.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')).body;
  assert.equal((await f.call('GET',`/api/resources/${resource.id}/content`)).body.content,'A & B\nSecond paragraph');
  const pptx=zipSync({'ppt/presentation.xml':Buffer.from('<p:sldIdLst><p:sldId id="256" r:id="rId10"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>'),'ppt/_rels/presentation.xml.rels':Buffer.from('<Relationships><Relationship Id="rId10" Target="slides/slide10.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>'),'ppt/slides/slide10.xml':Buffer.from('<a:p><a:r><a:t>Tenth</a:t></a:r></a:p>'),'ppt/slides/slide2.xml':Buffer.from('<a:p><a:r><a:t>Second</a:t></a:r></a:p>')});
  const slides=(await f.upload('/api/resources',pptx,{},'u1','slides.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation')).body.resource;
  const content=(await f.call('GET',`/api/resources/${slides.id}/content`)).body;
  assert.equal(content.pages[0].page,1);assert.equal(content.pages[1].page,2);
  assert.equal(content.content,'Tenth\n\nSecond');assert.equal(slides.page_count,2);assert.equal(slides.extraction_status,'ready');
});

test('PDF extracts actual page text and scans render through configured vision',async t=>{
  const f=await fixture(t);const {resource}=(await f.upload('/api/resources',pdfFixture('Actual PDF text for calculus'),{},'u1','lecture.pdf','application/pdf')).body;
  assert.equal(resource.extraction_status,'ready');assert.match((await f.call('GET',`/api/resources/${resource.id}/content`)).body.content,/Actual PDF text for calculus/);
  const scan=(await f.upload('/api/resources',pdfFixture(),{},'u1','scan.pdf','application/pdf')).body.resource;
  assert.equal(scan.extraction_status,'needs_vision');
  const stored=f.store.get('SELECT * FROM resources WHERE id=?',scan.id);
  const ai={configured:true,capabilities:{vision:true},async generate(input){assert.equal(input.purpose,'resource-transcription');assert.match(input.messages[0].content[1].image_url.url,/^data:image\/png;base64,/);return 'Visible handwritten calculus';}};
  const extraction=await extractResource(stored,f.config,ai);assert.equal(extraction.status,'ready');assert.equal(extraction.pages[0].content,'Visible handwritten calculus');
  const failed=await extractResource(stored,f.config,{...ai,async generate(){throw new Error('provider failed secret');}});assert.equal(failed.status,'failed');assert.equal(failed.pages.length,0);assert.doesNotMatch(failed.error,/secret/);
});

test('scan extraction bounds model pages and explicit page retry accumulates real selected pages',async t=>{
  const f=await fixture(t);f.config.maxVisionPages=2;
  const {resource}=(await f.upload('/api/resources',pdfPages([null,null,null,null,null]),{},'u1','long.pdf','application/pdf')).body;
  const ai={configured:true,capabilities:{vision:true},async generate(){return 'Transcribed actual selected image';}};
  const first=(await f.call('POST',`/api/resources/${resource.id}/extract`,{},'u1',ai)).body.resource;
  assert.equal(first.extraction_status,'partial');assert.equal(first.page_count,5);
  assert.deepEqual((await f.call('GET',`/api/resources/${resource.id}/content`)).body.pages.map(p=>p.page),[1,2]);
  await f.call('POST',`/api/resources/${resource.id}/extract`,{startPage:4,endPage:5},'u1',ai);
  assert.deepEqual((await f.call('GET',`/api/resources/${resource.id}/content`)).body.pages.map(p=>p.page),[1,2,4,5]);
  await f.call('POST',`/api/resources/${resource.id}/extract`,{startPage:3,endPage:3},'u1',ai);
  assert.equal((await f.call('GET',`/api/resources/${resource.id}`)).body.resource.extraction_status,'ready');
  await assert.rejects(f.call('POST',`/api/resources/${resource.id}/extract`,{startPage:6},'u1',ai),{status:400});
});

test('partial PDF keeps actual extracted pages when a later vision request fails',async t=>{
  const f=await fixture(t);const {resource}=(await f.upload('/api/resources',pdfPages(['Readable initial page for mathematics',null]),{},'u1','partial.pdf','application/pdf')).body;
  const result=await extractResource(f.store.get('SELECT * FROM resources WHERE id=?',resource.id),f.config,{configured:true,capabilities:{vision:true},async generate(){throw new Error('provider error');}});
  assert.equal(result.status,'partial');assert.equal(result.pages[0].page,1);assert.match(result.pages[0].content,/Readable initial page/);assert.ok(result.error);
});

test('context bounded extraction cannot claim the full document and never inherits',async t=>{
  const f=await fixture(t);const {resource}=(await f.upload('/api/resources','a'.repeat(210000))).body;
  assert.equal(resource.extraction_status,'partial');
  await f.call('PUT','/api/conversations/c1/references',{references:[{resourceId:resource.id}]});
  const context=getReferenceContext(f.store,f.principals.u1,'c1',{...f.config,resourceContextChars:100});assert.equal(context.truncated,true);assert.match(context.content,/未包含/);assert.ok(context.content.length<1000);
  assert.equal(getReferenceContext(f.store,f.principals.u1,'c3',f.config).content,'');
});

test('rejected submissions never enter public resources and submitted files stay tenant protected',async t=>{
  const f=await fixture(t);const {course}=(await f.call('POST','/api/courses',{name:'Physics'},'admin')).body;
  const {submission}=(await f.upload('/api/submissions','Rejected lecture',{courseId:course.id})).body;
  await assert.rejects(f.call('GET',`/api/submissions/${submission.id}/download`,{},'u2'),{status:404});
  assert.equal((await f.call('GET','/api/submissions',{},'u2')).body.submissions.length,0);
  await f.call('POST',`/api/submissions/${submission.id}/review`,{decision:'reject'},'admin');f.restart();
  assert.equal((await f.call('GET','/api/resources?scope=public')).body.resources.length,0);
  assert.equal((await f.call('GET','/api/submissions')).body.submissions[0].status,'rejected');
});

test('missing readable OOXML text is failed rather than ready',async t=>{
  const f=await fixture(t);const docx=zipSync({'word/document.xml':Buffer.from('<w:document><w:p><w:r><w:drawing/></w:r></w:p></w:document>')});
  const {resource}=(await f.upload('/api/resources',docx,{},'u1','empty.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')).body;
  assert.equal(resource.extraction_status,'failed');assert.ok(resource.extraction_error);
});

test('reference ranges, tenant boundary and deletion survive real database restart',async t=>{
  const f=await fixture(t);const {resource}=(await f.upload('/api/resources','Persistent evidence')).body;
  await assert.rejects(f.call('PUT','/api/conversations/c1/references',{references:[{resourceId:resource.id,startPage:2}]}),{status:400});
  await f.call('PUT','/api/conversations/c1/references',{references:[{resourceId:resource.id,startPage:1,endPage:1}]});
  f.restart();assert.match(getReferenceContext(f.store,f.principals.u1,'c1',f.config).content,/Persistent evidence/);
  await assert.rejects(f.call('GET','/api/conversations/c1/references',{},'u2'),{status:404});
  await f.call('DELETE',`/api/resources/${resource.id}`);f.restart();
  assert.equal(getReferenceContext(f.store,f.principals.u1,'c1',f.config).references[0].available,false);
  f.store.run('UPDATE conversations SET deleted_at=? WHERE id=?','2026','c1');
  assert.throws(()=>getReferenceContext(f.store,f.principals.u1,'c1',f.config),{status:404});
});

test('HTTP multipart upload/download returns actual protected attachment',async t=>{
  const f=await fixture(t);const server=createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://test');const result=await handleResources({method:req.method,path:url.pathname,url,req,principal:req.headers['x-test-user']==='u2'?f.principals.u2:f.principals.u1,store:f.store,config:f.config,body:async()=>({})});
    res.statusCode=result.status;if(result.file){res.setHeader('Content-Type',result.file.mime);res.end(await readFile(result.file.path));}else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result.body));}
  }catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:{code:e.code,message:e.message}}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;const form=new FormData();form.set('file',new Blob(['HTTP evidence'],{type:'text/plain'}),'evidence.txt');
  const response=await fetch(`${origin}/api/resources`,{method:'POST',body:form});assert.equal(response.status,201);const {resource}=await response.json();
  assert.equal(await (await fetch(`${origin}/api/resources/${resource.id}/download`)).text(),'HTTP evidence');
  assert.equal((await fetch(`${origin}/api/resources/${resource.id}/download`,{headers:{'x-test-user':'u2'}})).status,404);
});
