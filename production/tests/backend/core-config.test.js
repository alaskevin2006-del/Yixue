import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../../server/config.js';

test('production configuration uses durable paths and environment credentials without default account',()=>{
  const c=readConfig({NODE_ENV:'production',YIXUE_ORIGIN:'https://learn.example',YIXUE_DB_PATH:'./var/db.sqlite',YIXUE_UPLOADS_DIR:'./var/files',YIXUE_AI_BASE_URL:'https://api.example/v1',YIXUE_AI_API_KEY:'secret',YIXUE_AI_MODEL:'model'},[]);
  assert.equal(c.principalMode,'SESSION');assert.equal(c.secureCookies,true);assert.equal(c.adminPassword,undefined);assert.equal(c.ai.apiKey,'secret');assert.equal(c.ai.model,'model');assert.ok(c.dbPath.endsWith('db.sqlite'));assert.ok(c.uploadsDir.endsWith('files'));
});

test('thinking mode is optional, preserves explicit enabled or disabled and rejects invalid values',()=>{
  assert.equal(readConfig({},[]).ai.thinking,undefined);
  assert.equal(readConfig({YIXUE_AI_THINKING:'disabled'},[]).ai.thinking,'disabled');
  assert.equal(readConfig({YIXUE_AI_THINKING:'enabled'},[]).ai.thinking,'enabled');
  assert.throws(()=>readConfig({YIXUE_AI_THINKING:'false'},[]),/THINKING/);
});

test('production refuses insecure origin, dev identity, invalid limits and volatile database',()=>{
  assert.throws(()=>readConfig({NODE_ENV:'production'},['--dev-principal']),/DEV_ONLY/);
  assert.throws(()=>readConfig({NODE_ENV:'production',YIXUE_ORIGIN:'http://example.com'},[]),/ORIGIN/);
  assert.throws(()=>readConfig({YIXUE_DB_PATH:':memory:'},[]),/database/);
  assert.throws(()=>readConfig({YIXUE_PORT:'-1'},[]),/PORT/);
  assert.throws(()=>readConfig({YIXUE_MAX_UPLOAD_BYTES:'not-number'},[]),/UPLOAD/);
});
