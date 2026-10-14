import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../../server/store.js';
import {initResources} from '../../server/resources.js';
import {withUploadQuota} from '../../server/quota.js';
import {readConfig} from '../../server/config.js';
import {startApplication} from '../../server/start.js';

test('test environment config requires isolated cookie and preserves prefix',()=>{
 const c=readConfig({YIXUE_BASE_PATH:'/test',YIXUE_ENVIRONMENT:'test'},[]);
 assert.equal(c.basePath,'/test');assert.equal(c.cookieName,'yixue_test_session');assert.equal(c.cookiePath,'/test');
 assert.throws(()=>readConfig({YIXUE_BASE_PATH:'/../bad'},[]));
});
test('prefixed test service uses its own cookie and saves long manual text over HTTP',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yixue-prefix-'));
 const config=readConfig({YIXUE_BASE_PATH:'/test',YIXUE_DB_PATH:join(dir,'yixue.sqlite'),YIXUE_UPLOADS_DIR:join(dir,'uploads'),YIXUE_ADMIN_USERNAME:'admin',YIXUE_ADMIN_PASSWORD:'prefix-test-password',YIXUE_PORT:'0'},[]);
 const app=await startApplication(config),origin='http://127.0.0.1:'+app.server.address().port;
 try{const response=await fetch(origin+'/test/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'prefix-test-password'})});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/^yixue_test_session=/);assert.match(response.headers.get('set-cookie'),/Path=\/test;/);
 const auth=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0],headers={'content-type':'application/json',cookie,'x-csrf-token':auth.csrfToken};
 const saved=await fetch(origin+'/test/api/planner/records',{method:'POST',headers,body:JSON.stringify({kind:'text',title:'长文',content:'文'.repeat(40000)})});assert.equal(saved.status,201);assert.equal((await saved.json()).record.content.length,40000);
 assert.equal((await fetch(origin+'/test/api/auth/me',{headers:{cookie:cookie.replace('yixue_test_session','yixue_session')}})).status,401);
 const health=await (await fetch(origin+'/test/api/health')).json();assert.equal(health.environment,'test');
 }finally{await app.stop();await rm(dir,{recursive:true,force:true});}
});
test('quota reserves concurrent uploads and releases failures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yixue-quota-'));const store=new Store(':memory:');
 try{const config={uploadsDir:dir,userQuotaBytes:10,totalStorageBytes:100,minFreeDiskBytes:0};initResources(store,config);
 let resolve,entered;const ready=new Promise(r=>entered=r);
 const first=withUploadQuota(store,config,{id:'one'},7,async()=>{entered();await new Promise(r=>resolve=r);});await ready;
 await assert.rejects(withUploadQuota(store,config,{id:'one'},4,async()=>{}),e=>e.code==='USER_QUOTA_EXCEEDED');
 await withUploadQuota(store,config,{id:'two'},4,async()=>{});resolve();await first;
 await assert.rejects(withUploadQuota(store,config,{id:'one'},8,async()=>{throw Error('write failed');}),/write failed/);
 await withUploadQuota(store,config,{id:'one'},10,async()=>{});
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
