import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './errors.js';
const derive = promisify(scrypt);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const safeUser = row => ({id:row.id,username:row.username,role:row.role});
export function validPassword(value) {
  if(typeof value!=='string'||value.length<10||Buffer.byteLength(value)>256) throw new HttpError(400,'INVALID_PASSWORD','密码须至少 10 个字符，最多 256 字节。');
  return value;
}
function username(value) {
  if(typeof value!=='string'||!/^[\p{L}\p{N}_.@-]{2,64}$/u.test(value)) throw new HttpError(400,'INVALID_USERNAME','用户名须为 2–64 个字母、数字或 _ . @ -。');
  return value;
}
export async function hashPassword(password) {
  const salt=randomBytes(16).toString('hex'); const hash=await derive(validPassword(password),salt,64,{N:16384,r:8,p:1});
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
async function verify(password,encoded) {
  if(typeof password!=='string'||Buffer.byteLength(password)>256) return false;
  const [,salt,expected]=encoded.split('$'); const actual=await derive(password,salt,64,{N:16384,r:8,p:1});
  const bytes=Buffer.from(expected,'hex');return bytes.length===actual.length&&timingSafeEqual(bytes,actual);
}
export async function bootstrapAdmin(store,config) {
  if(store.get("SELECT id FROM users WHERE role='admin' AND disabled=0"))return;
  if(!config.adminUsername||!config.adminPassword) throw Error('ADMIN_BOOTSTRAP_REQUIRED');
  const name=username(config.adminUsername),hash=await hashPassword(config.adminPassword),id=randomUUID(),at=new Date().toISOString();
  store.transaction(()=>{store.run('INSERT INTO user_principals(id,created_at) VALUES (?,?)',id,at);store.run('INSERT INTO users(id,username,password_hash,role,created_at) VALUES (?,?,?,?,?)',id,name,hash,'admin',at);});
}
export function createAuth(store,config) {
  const attempts=new Map();
  const cookieName='yixue_session';
  function cookie(token,clear=false){return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; ${config.secureCookies?'Secure; ':''}Max-Age=${clear?0:Math.floor((config.sessionTtlMs??604800000)/1000)}`;}
  function readSession(req){
    const token=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    return store.get('SELECT s.*,u.username,u.role,u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND u.disabled=0',sha256(token),Date.now());
  }
  function authenticate(req){const session=readSession(req);return session?{id:session.user_id,username:session.username,role:session.role}:null;}
  function origin(req){
    if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'ORIGIN_DENIED','请求来源不受支持。');
    if(!req.headers.origin)return;
    const expected=config.origin??`${config.secureCookies?'https':'http'}://${req.headers.host}`;
    if(req.headers.origin!==expected)throw new HttpError(403,'ORIGIN_DENIED','请求来源不受支持。');
  }
  function mutation(req){origin(req);const session=readSession(req);const value=req.headers['x-csrf-token'];if(!session||typeof value!=='string'||Buffer.byteLength(value)!==Buffer.byteLength(session.csrf_token)||!timingSafeEqual(Buffer.from(value),Buffer.from(session.csrf_token)))throw new HttpError(403,'CSRF_DENIED','请求验证已失效，请重新登录。');}
  async function handle(ctx){
    const {method,path,req,principal,body}=ctx;
    if(path==='/api/auth/login'&&method==='POST'){
      origin(req);const input=await body();const name=typeof input.username==='string'&&input.username.length<=64?input.username:'';
      const key=`${req.socket.remoteAddress}:${name.toLowerCase()}`;let entry=attempts.get(key);if(!entry||entry.until<Date.now())entry={count:0,until:Date.now()+900000};
      if(entry.count>=10)throw new HttpError(429,'LOGIN_RATE_LIMIT','登录尝试过多，请稍后重试。');entry.count++;attempts.set(key,entry);
      if(attempts.size>10000){for(const [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);if(attempts.size>10000)attempts.delete(attempts.keys().next().value);}
      const row=store.get('SELECT * FROM users WHERE username=? AND disabled=0',name);
      // Unknown usernames incur the same expensive password derivation.
      const accepted=await verify(input.password,row?.password_hash??'scrypt$00000000000000000000000000000000$'+ '00'.repeat(64));
      if(!row||!accepted)throw new HttpError(401,'INVALID_CREDENTIALS','用户名或密码错误。');
      attempts.delete(key);const token=randomBytes(32).toString('hex'),csrfToken=randomBytes(24).toString('hex'),now=Date.now();
      store.transaction(()=>{const current=store.get('SELECT password_hash,disabled FROM users WHERE id=?',row.id);if(!current||current.disabled||current.password_hash!==row.password_hash)throw new HttpError(401,'INVALID_CREDENTIALS','用户名或密码错误。');store.run('DELETE FROM sessions WHERE expires_at<=?',now);store.run('INSERT INTO sessions VALUES (?,?,?,?,?)',sha256(token),row.id,csrfToken,now+(config.sessionTtlMs??604800000),new Date().toISOString());});
      return{status:200,body:{user:safeUser(row),csrfToken},headers:{'set-cookie':cookie(token)}};
    }
    if(!principal)return null;
    if(path==='/api/auth/me'&&method==='GET')return{status:200,body:{user:principal,csrfToken:readSession(req).csrf_token}};
    if(path==='/api/auth/logout'&&method==='POST'){store.run('DELETE FROM sessions WHERE token_hash=?',readSession(req).token_hash);return{status:204,headers:{'set-cookie':cookie('',true)}};}
    if(path==='/api/auth/password'&&method==='POST'){
      const input=await body();const row=store.get('SELECT * FROM users WHERE id=?',principal.id);
      if(!await verify(input.currentPassword,row.password_hash))throw new HttpError(400,'INVALID_CURRENT_PASSWORD','当前密码错误。');
      const hash=await hashPassword(input.newPassword);store.transaction(()=>{const current=store.get('SELECT password_hash FROM users WHERE id=?',principal.id);if(!readSession(req)||current?.password_hash!==row.password_hash)throw new HttpError(401,'AUTH_REQUIRED','登录状态已失效，请重新登录。');store.run('UPDATE users SET password_hash=? WHERE id=?',hash,principal.id);store.run('DELETE FROM sessions WHERE user_id=?',principal.id);});
      return{status:204,headers:{'set-cookie':cookie('',true)}};
    }
    if(path.startsWith('/api/admin/users')){
      if(principal.role!=='admin')throw new HttpError(403,'ADMIN_REQUIRED','此操作需要管理员权限。');
      if(path==='/api/admin/users'&&method==='GET')return{status:200,body:{users:store.all('SELECT id,username,role,disabled,created_at FROM users ORDER BY created_at,id')}};
      if(path==='/api/admin/users'&&method==='POST'){
        const input=await body(),name=username(input.username),role=input.role??'user';if(!['user','admin'].includes(role))throw new HttpError(400,'INVALID_ROLE','账号角色无效。');
        const hash=await hashPassword(input.password),id=randomUUID(),at=new Date().toISOString();
        if(store.get('SELECT id FROM users WHERE username=?',name))throw new HttpError(409,'USERNAME_EXISTS','用户名已存在。');
        store.transaction(()=>{store.run('INSERT INTO user_principals VALUES (?,?)',id,at);store.run('INSERT INTO users(id,username,password_hash,role,created_at) VALUES (?,?,?,?,?)',id,name,hash,role,at);});
        return{status:201,body:{user:{id,username:name,role}}};
      }
      const account=path.match(/^\/api\/admin\/users\/([^/]+)$/);
      if(account&&method==='PATCH'){
        const input=await body();if(typeof input.disabled!=='boolean')throw new HttpError(400,'INVALID_DISABLED','停用状态必须为布尔值。');
        const target=store.get('SELECT id,username,role,disabled,created_at FROM users WHERE id=?',account[1]);if(!target)throw new HttpError(404,'NOT_FOUND','账号不存在。');
        if(target.id===principal.id&&input.disabled)throw new HttpError(409,'SELF_DISABLE','不能停用当前登录账号。');
        store.transaction(()=>{
          const session=readSession(req);if(!session||session.user_id!==principal.id||session.role!=='admin')throw new HttpError(401,'AUTH_REQUIRED','登录已失效，请重新登录。');
          if(!store.get("SELECT id FROM users WHERE id=? AND disabled=0 AND role='admin'",principal.id))throw new HttpError(401,'ACCOUNT_DISABLED','账号不可用。');
          if(input.disabled&&target.role==='admin'&&!target.disabled&&store.get("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND disabled=0").count<=1)throw new HttpError(409,'LAST_ADMIN','至少保留一个可用管理员。');
          store.run('UPDATE users SET disabled=? WHERE id=?',Number(input.disabled),target.id);
          if(input.disabled)store.run('DELETE FROM sessions WHERE user_id=?',target.id);
        });
        return{status:200,body:{user:{...target,disabled:Number(input.disabled)}}};
      }
      const match=path.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
      if(match&&method==='POST'){const input=await body();if(!store.get('SELECT id FROM users WHERE id=?',match[1]))throw new HttpError(404,'NOT_FOUND','账号不存在。');const hash=await hashPassword(input.password);store.transaction(()=>{store.run('UPDATE users SET password_hash=? WHERE id=?',hash,match[1]);store.run('DELETE FROM sessions WHERE user_id=?',match[1]);});return{status:204};}
    }
    return null;
  }
  return{authenticate,mutation,origin,handle};
}
