import {readFile} from 'node:fs/promises';
if(process.env.YIXUE_ENVIRONMENT!=='test')throw Error('Test environment required');
const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(30000)});
const base=process.env.YIXUE_ORIGIN+'/test',origin=process.env.YIXUE_ORIGIN;
const credentials=JSON.parse(await readFile('/data/operations/test-account.json','utf8'));
async function login(username,password,role){
  const response=await request(base+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(20000)});
  if(response.status!==200)throw Error('Test login failed');
  const result=await response.json(),cookie=response.headers.get('set-cookie');
  if(result.user.role!==role||!cookie?.startsWith('yixue_test_session=')||!cookie.includes('Path=/test'))throw Error('Test session isolation failed');
  return {origin,cookie:cookie.split(';')[0],'x-csrf-token':result.csrfToken};
}
const adminHeaders=await login(process.env.YIXUE_ADMIN_USERNAME,process.env.YIXUE_ADMIN_PASSWORD,'admin');
await request(base+'/api/auth/logout',{method:'POST',headers:adminHeaders});
const headers=await login(credentials.username,credentials.password,'user');
let resourceId;
try{
  const forbidden=await request(base+'/api/admin/users',{headers});if(forbidden.status!==403)throw Error('Ordinary test user reached administrator API');
  const content='Yixue isolated test deployment file roundtrip.';
  const form=new FormData();form.append('file',new Blob([content],{type:'text/plain'}),'deployment-check.txt');
  const upload=await request(base+'/api/resources',{method:'POST',headers,body:form});if(upload.status!==201)throw Error('Test upload failed');
  resourceId=(await upload.json()).resource.id;
  const download=await request(base+'/api/resources/'+resourceId+'/download',{headers});if(download.status!==200||await download.text()!==content)throw Error('Test download differs');
  const crossed=await request(origin+'/api/auth/me',{headers});if(crossed.status!==401)throw Error('Test session accepted in production');
}finally{
  if(resourceId){const deleted=await request(base+'/api/resources/'+resourceId,{method:'DELETE',headers});if(deleted.status!==204)throw Error('Test smoke file cleanup failed');}
  await request(base+'/api/auth/logout',{method:'POST',headers});
}
console.log(JSON.stringify({ordinaryLogin:true,originalAdminLogin:true,uploadDownload:true,testSessionIsolated:true,ordinaryAdminDenied:true,smokeFileRemoved:true}));
