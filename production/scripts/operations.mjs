import {readdir,lstat,statfs,mkdir,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

// Read metadata only. Never remove or repair files from an audit.
export async function inspectStorage(dataDir,{minFreeBytes=512*1024*1024,maxStorageBytes=20*1024**3}={}) {
  if(!Number.isSafeInteger(minFreeBytes)||minFreeBytes<0||!Number.isSafeInteger(maxStorageBytes)||maxStorageBytes<1)throw Error('Invalid storage thresholds');
  const root=resolve(dataDir),db=new DatabaseSync(join(root,'yixue.sqlite'),{readOnly:true});
  let keys=[],databaseOk,foreignKeysOk;
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN');
    databaseOk=db.prepare('PRAGMA quick_check').all().every(r=>r.quick_check==='ok');
    foreignKeysOk=!db.prepare('PRAGMA foreign_key_check').get();
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    for(const table of ['resources','resource_submissions'])if(tables.has(table)){
      const withdrawn=table==='resource_submissions'&&db.prepare('PRAGMA table_info(resource_submissions)').all().some(c=>c.name==='deleted_at');
      keys.push(...db.prepare(`SELECT storage_key FROM ${table} WHERE storage_key IS NOT NULL${withdrawn?' AND deleted_at IS NULL':''}`).all().map(r=>r.storage_key));
    }
    db.exec('COMMIT');
  } finally {db.close();}
  const referenced=new Set(keys),actual=new Set(),unsafe=[],missing=[],orphans=[];let bytes=0;
  try{for(const entry of await readdir(join(root,'uploads'),{withFileTypes:true})){
    const info=await lstat(join(root,'uploads',entry.name));
    if(!info.isFile()||info.isSymbolicLink()){unsafe.push(entry.name);continue;}
    actual.add(entry.name);bytes+=info.size;
  }}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const key of referenced){if(typeof key!=='string'||!key||key==='.'||key==='..'||/[\\/]/.test(key)){unsafe.push(key);continue;}if(!actual.has(key))missing.push(key);}
  for(const key of actual)if(!referenced.has(key))orphans.push(key);
  const disk=await statfs(root),freeBytes=disk.bavail*disk.bsize;
  const issues=[];if(!databaseOk||!foreignKeysOk)issues.push('DATABASE_INTEGRITY');if(missing.length)issues.push('MISSING_FILES');if(orphans.length)issues.push('ORPHAN_FILES');if(unsafe.length)issues.push('UNSAFE_FILES');if(freeBytes<minFreeBytes)issues.push('DISK_LOW');if(bytes>maxStorageBytes)issues.push('STORAGE_LIMIT');
  return {checkedAt:new Date().toISOString(),ok:issues.length===0,issues,databaseOk,foreignKeysOk,uploadBytes:bytes,freeBytes,limits:{minFreeBytes,maxStorageBytes},referencedFiles:referenced.size,actualFiles:actual.size,missing,orphans,unsafe,consistency:'online-observation; repeat offline before remediation'};
}
export async function writeReport(dataDir,report){
  const dir=join(resolve(dataDir),'operations');await mkdir(dir,{recursive:true,mode:0o700});
  const {missing,orphans,unsafe,...summary}=report;
  for(const [name,value] of [['integrity.json',report],['status.json',{...summary,missingFiles:missing.length,orphanFiles:orphans.length,unsafeFiles:unsafe.length}]]){
    const temp=join(dir,`${name}.${process.pid}.tmp`);await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,join(dir,name));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [action,dir,...flags]=process.argv.slice(2);if(action!=='check'||!dir||flags.some(f=>f!=='--write'))throw Error('Usage: operations.mjs check DATA_DIR [--write]');
    const report=await inspectStorage(dir,{minFreeBytes:Number(process.env.YIXUE_MIN_FREE_DISK_BYTES??512*1024**2),maxStorageBytes:Number(process.env.YIXUE_TOTAL_STORAGE_BYTES??20*1024**3)});
    if(flags.includes('--write'))await writeReport(dir,report);
    console.log(JSON.stringify({ok:report.ok,issues:report.issues,uploadBytes:report.uploadBytes,freeBytes:report.freeBytes,missingFiles:report.missing.length,orphanFiles:report.orphans.length}));if(!report.ok)process.exitCode=2;
  }catch{console.error('OPERATIONS_CHECK_FAILED');process.exitCode=1;}
}
