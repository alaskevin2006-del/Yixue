import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../../server/store.js';
import { createBackup,restoreBackup } from '../../scripts/backup.mjs';

test('offline backup and restore preserve real database and files and reject overwrite/corruption',async t=>{
  const root=await mkdtemp(join(tmpdir(),'yixue-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const data=join(root,'data');await mkdir(join(data,'uploads'),{recursive:true});
  const store=new Store(join(data,'yixue.sqlite'));store.run("INSERT INTO user_principals VALUES ('saved','2026-10-13')");store.close();
  await writeFile(join(data,'uploads','abc.bin'),'actual resource');
  const backup=join(root,'backup');await createBackup({dataDir:data,outputDir:backup,offline:true});
  const restored=join(root,'restored');await restoreBackup({backupDir:backup,outputDir:restored,offline:true});
  const check=new Store(join(restored,'yixue.sqlite'));assert.equal(check.get("SELECT id FROM user_principals WHERE id='saved'").id,'saved');check.close();
  assert.equal(await readFile(join(restored,'uploads','abc.bin'),'utf8'),'actual resource');
  await assert.rejects(restoreBackup({backupDir:backup,outputDir:restored,offline:true}),/exists/i);
  await writeFile(join(backup,'uploads','abc.bin'),'corrupted');
  await assert.rejects(restoreBackup({backupDir:backup,outputDir:join(root,'bad'),offline:true}),/checksum/i);
});
test('backup refuses missing offline acknowledgement and nested destinations',async t=>{
  const root=await mkdtemp(join(tmpdir(),'yixue-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await assert.rejects(createBackup({dataDir:root,outputDir:join(root,'nested'),offline:true}),/inside/i);
  await assert.rejects(createBackup({dataDir:root,outputDir:root+'-other'}),/offline/i);
});
