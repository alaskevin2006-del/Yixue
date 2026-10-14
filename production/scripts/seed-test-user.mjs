import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../server/store.js';
import {bootstrapAdmin,hashPassword} from '../server/auth.js';
export async function seedTestUser({dbPath,receiptPath,adminUsername,adminPassword,environment}){
  if(environment!=='test')throw Error('Test environment required');
  const store=new Store(dbPath);
  try{
    await bootstrapAdmin(store,{adminUsername,adminPassword});
    const username='test-student',existing=store.get('SELECT id,role FROM users WHERE username=?',username);
    if(existing){if(existing.role!=='user')throw Error('Test username is occupied');await readFile(receiptPath);return {created:false,username};}
    const password=randomBytes(24).toString('base64url'),id=randomUUID(),at=new Date().toISOString(),hash=await hashPassword(password);
    await mkdir(dirname(receiptPath),{recursive:true,mode:0o700});
    // Exclusive receipt creation precedes account creation; never reset any existing credentials.
    await writeFile(receiptPath,JSON.stringify({username,password,createdAt:at},null,2),{flag:'wx',mode:0o600});
    store.transaction(()=>{store.run('INSERT INTO user_principals(id,created_at) VALUES (?,?)',id,at);store.run('INSERT INTO users(id,username,password_hash,role,created_at) VALUES (?,?,?,?,?)',id,username,hash,'user',at);});
    return {created:true,username};
  }finally{store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await seedTestUser({dbPath:process.env.YIXUE_DB_PATH,receiptPath:resolve(process.env.YIXUE_TEST_RECEIPT??'/data/operations/test-account.json'),adminUsername:process.env.YIXUE_ADMIN_USERNAME,adminPassword:process.env.YIXUE_ADMIN_PASSWORD,environment:process.env.YIXUE_ENVIRONMENT})));}
  catch{console.error('TEST_ACCOUNT_SEED_FAILED');process.exitCode=1;}
}
