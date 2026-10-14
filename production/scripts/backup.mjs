import { mkdir,readdir,lstat,readFile,writeFile,copyFile,access } from 'node:fs/promises';
import { resolve,join,relative,isAbsolute,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function roots(source,target,offline) {
  if(!offline) throw Error('Stop the application first and explicitly acknowledge offline mode.');
  const from=resolve(source),to=resolve(target),rel=relative(from,to);
  if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel))) throw Error('Destination cannot be inside source.');
  return {from,to};
}
async function fresh(path) {try{await access(path);}catch(e){if(e.code==='ENOENT')return;throw e;}throw Error('Destination already exists; choose a new empty path.');}
async function collect(root,prefix='') {
  const out=[];
  for(const entry of await readdir(join(root,prefix),{withFileTypes:true})) {
    const name=prefix?`${prefix}/${entry.name}`:entry.name;
    const info=await lstat(join(root,name));
    if(info.isSymbolicLink())throw Error('Backup refuses symbolic links.');
    if(info.isDirectory())out.push(...await collect(root,name));
    else if(info.isFile())out.push(name);
    else throw Error('Backup only supports regular files.');
  }
  return out;
}
function checkDatabase(path) {
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Database integrity check failed.');
    if(db.prepare('PRAGMA foreign_key_check').get())throw Error('Database foreign key check failed.');
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    const files=[];
    if(tables.has('resources'))files.push(...db.prepare('SELECT storage_key FROM resources WHERE storage_key IS NOT NULL').all().map(r=>r.storage_key));
    if(tables.has('resource_submissions')){
      const withdrawn=db.prepare('PRAGMA table_info(resource_submissions)').all().some(c=>c.name==='deleted_at');
      files.push(...db.prepare('SELECT storage_key FROM resource_submissions'+(withdrawn?' WHERE deleted_at IS NULL':'')).all().map(r=>r.storage_key));
    }
    return files;
  } finally {db.close();}
}
async function checkFiles(data,keys) {for(const key of keys){if(typeof key!=='string'||key.includes('/')||key.includes('\\')||key==='..')throw Error('Invalid storage key in database.');await access(join(data,'uploads',key));}}

export async function createBackup({dataDir,outputDir,offline=false}) {
  const {from,to}=roots(dataDir,outputDir,offline);await fresh(to);
  // Closing the writer before this call is required; copy WAL too if an offline unclean exit left it.
  const names=['yixue.sqlite'];
  for(const suffix of ['-wal','-shm']){try{await access(join(from,'yixue.sqlite'+suffix));names.push('yixue.sqlite'+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}}
  try{names.push(...(await collect(join(from,'uploads'))).map(name=>'uploads/'+name));}catch(e){if(e.code!=='ENOENT')throw e;}
  await checkFiles(from,checkDatabase(join(from,'yixue.sqlite')));
  await mkdir(to,{recursive:true,mode:0o700});const files=[];
  for(const name of names){const source=join(from,name),target=join(to,name);if(!(await lstat(source)).isFile())throw Error('Nonregular backup source.');await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(source,target);const bytes=await readFile(target);files.push({name,size:bytes.length,sha256:hash(bytes)});}
  await checkFiles(to,checkDatabase(join(to,'yixue.sqlite')));
  // SQLite read-only access may update WAL sidecars; checksum final snapshot bytes.
  for(const item of files){const bytes=await readFile(join(to,item.name));item.size=bytes.length;item.sha256=hash(bytes);}
  const manifest={format:'yixue-offline-backup-v1',createdAt:new Date().toISOString(),files};
  await writeFile(join(to,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});return manifest;
}
export async function restoreBackup({backupDir,outputDir,offline=false}) {
  const {from,to}=roots(backupDir,outputDir,offline);await fresh(to);
  const manifest=JSON.parse(await readFile(join(from,'manifest.json'),'utf8'));
  if(manifest.format!=='yixue-offline-backup-v1'||!Array.isArray(manifest.files)||!manifest.files.some(f=>f.name==='yixue.sqlite'))throw Error('Unsupported backup manifest.');
  const seen=new Set();
  for(const file of manifest.files) {
    if(typeof file.name!=='string'||seen.has(file.name)||!(file.name==='yixue.sqlite'||/^yixue\.sqlite-(wal|shm)$/.test(file.name)||/^uploads\/[a-zA-Z0-9_.-]+$/.test(file.name))||file.name.includes('..'))throw Error('Unsafe backup filename.');
    seen.add(file.name);const target=join(from,file.name);if(!(await lstat(target)).isFile())throw Error('Backup source is not a regular file.');
    const bytes=await readFile(target);if(bytes.length!==file.size||hash(bytes)!==file.sha256)throw Error('Backup checksum mismatch; restore stopped.');
  }
  await mkdir(to,{recursive:true,mode:0o700});
  for(const file of manifest.files){const target=join(to,file.name);await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(join(from,file.name),target);}
  await mkdir(join(to,'uploads'),{recursive:true,mode:0o700});await checkFiles(to,checkDatabase(join(to,'yixue.sqlite')));
  return {restored:true,fileCount:manifest.files.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [action,source,destination,...flags]=process.argv.slice(2);
  try {
    if(!['backup','restore'].includes(action)||!source||!destination||flags.some(v=>v!=='--offline'))throw Error('Usage: node scripts/backup.mjs backup|restore SOURCE NEW_DESTINATION --offline');
    const value=action==='backup'?await createBackup({dataDir:source,outputDir:destination,offline:flags.includes('--offline')}):await restoreBackup({backupDir:source,outputDir:destination,offline:flags.includes('--offline')});
    console.log(JSON.stringify({action,ok:true,fileCount:value.fileCount??value.files.length}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
