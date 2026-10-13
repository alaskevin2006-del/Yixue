import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { serveFrontend } from '../../server/static.js';

test('production static server serves built modules/fonts and rejects unlisted files and traversal',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'yixue-static-'));
  await mkdir(join(dir,'client')); await mkdir(join(dir,'vendor','fonts'),{recursive:true});
  await writeFile(join(dir,'client','api.js'),'export const loaded = true;');
  await writeFile(join(dir,'vendor','fonts','font.woff2'),'font');
  await writeFile(join(dir,'vendor','module.mjs'),'export default true;');
  await writeFile(join(dir,'.env'),'not-public');await writeFile(join(dir,'package.json'),'not-public');
  const server=createServer((req,res)=>serveFrontend(req,res,req.url,dir));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const module=await fetch(origin+'/client/api.js'); assert.equal(module.status,200);assert.match(await module.text(),/loaded/);
  const font=await fetch(origin+'/vendor/fonts/font.woff2');assert.equal(font.status,200);assert.match(font.headers.get('content-type'),/font\/woff2/);
  assert.equal((await fetch(origin+'/vendor/module.mjs')).status,200);
  for(const path of ['/.env','/package.json','/client/%2e%2e%2f.env','/vendor/secret.json']) assert.equal((await fetch(origin+path)).status,404);
  assert.equal((await fetch(origin+'/client/api.js',{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/client/api.js',{method:'HEAD'})).status,200);
});
