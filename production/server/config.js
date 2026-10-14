import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function integer(env,key,fallback,min,max){const raw=env[key]??String(fallback);if(!/^\d+$/.test(raw)||Number(raw)<min||Number(raw)>max)throw Error(`Invalid ${key}.`);return Number(raw);}
export function readConfig(env=process.env,args=process.argv.slice(2)){
  if(args.some(arg=>!['--dev-principal','--serve-frontend'].includes(arg)))throw Error('Unsupported server option.');
  const dev=args.includes('--dev-principal');if(dev&&env.NODE_ENV==='production')throw Error('DEV_ONLY identity is forbidden in production.');
  const rawPath=env.YIXUE_DB_PATH??fileURLToPath(new URL('../.data/yixue.sqlite',import.meta.url));
  if(!rawPath.trim()||rawPath===':memory:')throw Error('A disk database path is required.');
  let origin=env.YIXUE_ORIGIN;
  if(origin){const url=new URL(origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid YIXUE_ORIGIN.');origin=url.origin;}
  if(env.NODE_ENV==='production'&&(!origin||!origin.startsWith('https://')))throw Error('HTTPS YIXUE_ORIGIN is required in production.');
  if(env.YIXUE_AI_THINKING!==undefined&&!['disabled','enabled'].includes(env.YIXUE_AI_THINKING))throw Error('Invalid YIXUE_AI_THINKING.');
  const basePath=env.YIXUE_BASE_PATH??'';
  if(basePath&&!/^\/[a-zA-Z0-9_-]+$/.test(basePath))throw Error('Invalid YIXUE_BASE_PATH.');
  const environment=env.YIXUE_ENVIRONMENT??(basePath?'test':'production');
  if(!['production','test','local'].includes(environment))throw Error('Invalid YIXUE_ENVIRONMENT.');
  const cookieName=env.YIXUE_COOKIE_NAME??(basePath?'yixue_test_session':'yixue_session'),cookiePath=env.YIXUE_COOKIE_PATH??(basePath||'/');
  if(!/^[a-zA-Z0-9_]+$/.test(cookieName)||!/^\/[a-zA-Z0-9_/-]*$/.test(cookiePath))throw Error('Invalid session cookie configuration.');
  if(basePath&&(cookieName==='yixue_session'||cookiePath!==basePath))throw Error('Test session must be isolated.');
  return{
    basePath,environment,cookieName,cookiePath,
    userQuotaBytes:integer(env,'YIXUE_USER_QUOTA_BYTES',1024**3,1024,Number.MAX_SAFE_INTEGER),
    totalStorageBytes:integer(env,'YIXUE_TOTAL_STORAGE_BYTES',20*1024**3,1024,Number.MAX_SAFE_INTEGER),
    minFreeDiskBytes:integer(env,'YIXUE_MIN_FREE_DISK_BYTES',512*1024**2,0,Number.MAX_SAFE_INTEGER),
    requestsPerMinute:integer(env,'YIXUE_REQUESTS_PER_MINUTE',600,1,100000),
    operationsStatusPath:env.YIXUE_OPERATIONS_STATUS_PATH,
    host:env.YIXUE_HOST??'127.0.0.1',port:integer(env,'YIXUE_PORT',3000,0,65535),dbPath:resolve(rawPath),principalMode:dev?'DEV_ONLY':'SESSION',
    origin,secureCookies:origin?.startsWith('https://')??false,sessionTtlMs:integer(env,'YIXUE_SESSION_HOURS',168,1,720)*3600000,
    uploadsDir:resolve(env.YIXUE_UPLOADS_DIR??fileURLToPath(new URL('../.data/uploads',import.meta.url))),maxUploadBytes:integer(env,'YIXUE_MAX_UPLOAD_BYTES',20*1024*1024,1024,100*1024*1024),
    staticRoot:args.includes('--serve-frontend')?resolve(env.YIXUE_STATIC_ROOT??fileURLToPath(new URL('../dist',import.meta.url))):null,
    adminUsername:env.YIXUE_ADMIN_USERNAME,adminPassword:env.YIXUE_ADMIN_PASSWORD,maxConcurrentRuns:integer(env,'YIXUE_MAX_CONCURRENT_RUNS',4,1,32),contextChars:48000,
    ai:{baseUrl:env.YIXUE_AI_BASE_URL,apiKey:env.YIXUE_AI_API_KEY,model:env.YIXUE_AI_MODEL,thinking:env.YIXUE_AI_THINKING,vision:env.YIXUE_AI_VISION==='true',timeoutMs:integer(env,'YIXUE_AI_TIMEOUT_MS',60000,100,180000),maxOutputTokens:integer(env,'YIXUE_AI_MAX_OUTPUT_TOKENS',4096,128,16000),retries:integer(env,'YIXUE_AI_RETRIES',1,0,2)}
  };
}
