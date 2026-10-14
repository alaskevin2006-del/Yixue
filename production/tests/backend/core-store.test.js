import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('store migrates original messages, permits assistant messages and rolls back failed writes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yixue-core-store-'));
  const path = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(readFileSync(new URL('../../server/db/schema.sql', import.meta.url), 'utf8'));
  legacy.exec("INSERT INTO user_principals VALUES ('u','now'); INSERT INTO subjects VALUES ('s','u','数学','now','now'); INSERT INTO conversations VALUES ('c','s','问题','now','now',NULL); INSERT INTO messages VALUES ('m','c','user','原始问题',1,'now'); INSERT INTO message_requests VALUES ('u','c','request','hash','m','now');");
  legacy.close();
  const module = await import('../../server/store.js').catch(() => null);
  assert.ok(module?.Store, 'production Store must exist');
  const store = new module.Store(path);
  try {
    assert.equal(store.get('SELECT content FROM messages WHERE id=?', 'm').content, '原始问题');
    assert.equal(store.get('SELECT message_id FROM message_requests').message_id, 'm');
    store.run("INSERT INTO messages VALUES ('a','c','assistant','答案',2,'now')");
    assert.throws(() => store.transaction(() => { store.run("UPDATE subjects SET name='changed' WHERE id='s'"); throw Error('abort'); }));
    assert.equal(store.get("SELECT name FROM subjects WHERE id='s'").name, '数学');
    assert.throws(() => store.transaction(async () => {}), /synchronous/);
    assert.equal(store.get('PRAGMA foreign_key_check'), null);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('store refuses unknown future schema without downgrading it',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'yixue-future-store-')),path=join(directory,'db.sqlite');
  const db=new DatabaseSync(path);db.exec('PRAGMA user_version=99');db.close();
  const {Store}=await import('../../server/store.js');assert.throws(()=>new Store(path),/schema version/);
  const after=new DatabaseSync(path);assert.equal(after.prepare('PRAGMA user_version').get().user_version,99);after.close();rmSync(directory,{recursive:true,force:true});
});
