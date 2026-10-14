import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../../server/store.js';
import {inspectStorage,writeReport} from '../../scripts/operations.mjs';
import {seedTestUser} from '../../scripts/seed-test-user.mjs';
import {createBackup,restoreBackup} from '../../scripts/backup.mjs';
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'yixue-ops-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'uploads'));return root;}
test('metadata audit reports missing/orphan files without deleting and publishes private aggregate',async t=>{
  const root=await fixture(t),store=new Store(join(root,'yixue.sqlite'));
  store.db.exec("CREATE TABLE resources(storage_key TEXT); INSERT INTO resources VALUES ('missing.bin'),('present.bin'); CREATE TABLE resource_submissions(storage_key TEXT); INSERT INTO resource_submissions VALUES ('present.bin')");store.close();
  await writeFile(join(root,'uploads','present.bin'),'1234');await writeFile(join(root,'uploads','orphan.bin'),'123');
  const report=await inspectStorage(root,{minFreeBytes:Number.MAX_SAFE_INTEGER,maxStorageBytes:6});
  assert.deepEqual(report.missing,['missing.bin']);assert.deepEqual(report.orphans,['orphan.bin']);assert.equal(report.uploadBytes,7);assert.equal(report.referencedFiles,2);
  assert.ok(report.issues.includes('DISK_LOW'));assert.ok(report.issues.includes('STORAGE_LIMIT'));
  await writeReport(root,report);const summary=JSON.parse(await readFile(join(root,'operations','status.json'),'utf8'));assert.equal(summary.missingFiles,1);assert.equal(summary.missing,undefined);assert.equal(summary.orphans,undefined);
  assert.equal(await readFile(join(root,'uploads','orphan.bin'),'utf8'),'123');
});
test('test bootstrap preserves admin and ordinary passwords on repeat, production seeding refused',async t=>{
  const root=await fixture(t),args={dbPath:join(root,'yixue.sqlite'),receiptPath:join(root,'operations','test-account.json'),adminUsername:'admin',adminPassword:'original-admin-password',environment:'test'};
  await assert.rejects(seedTestUser({...args,environment:'production'}),/Test environment/);
  assert.equal((await seedTestUser(args)).created,true);
  const receipt=JSON.parse(await readFile(args.receiptPath,'utf8'));assert.equal(receipt.username,'test-student');assert.ok(receipt.password.length>=30);
  const before=new Store(args.dbPath),hashes=before.all('SELECT username,password_hash,role FROM users ORDER BY username');before.close();
  assert.equal((await seedTestUser({...args,adminPassword:'changed-admin-password'})).created,false);
  const after=new Store(args.dbPath);assert.deepEqual(after.all('SELECT username,password_hash,role FROM users ORDER BY username'),hashes);assert.equal(after.all('SELECT * FROM subjects').length,0);after.close();
});
test('backup includes retained soft-deleted files and restores into new path only',async t=>{
  const root=await fixture(t),data=join(root,'data');await mkdir(join(data,'uploads'),{recursive:true});const store=new Store(join(data,'yixue.sqlite'));
  store.db.exec("CREATE TABLE resources(storage_key TEXT,deleted_at TEXT); INSERT INTO resources VALUES ('retained.bin','2026-10-14'); CREATE TABLE resource_submissions(storage_key TEXT,deleted_at TEXT); INSERT INTO resource_submissions VALUES ('withdrawn.bin','2026-10-14')");store.close();
  await assert.rejects(createBackup({dataDir:data,outputDir:join(root,'missing-backup'),offline:true}));
  await writeFile(join(data,'uploads','retained.bin'),'retained source');
  const backup=join(root,'snapshot'),restored=join(root,'drill');await createBackup({dataDir:data,outputDir:backup,offline:true});await restoreBackup({backupDir:backup,outputDir:restored,offline:true});
  assert.equal(await readFile(join(restored,'uploads','retained.bin'),'utf8'),'retained source');await assert.rejects(restoreBackup({backupDir:backup,outputDir:data,offline:true}),/exists/);
  assert.deepEqual((await inspectStorage(restored)).missing,[]);
});
