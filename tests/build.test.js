import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
test('build contains every imported client module and preserves local API frontend',()=>{
 for(const f of ['index.html','app.js','styles.css','client/main.js','client/views.js','client/model.js','client/storage.js','client/fixtures.js','legacy/index.html','legacy/app.js','legacy/styles.css','version.json'])assert(existsSync(new URL('../dist/'+f,import.meta.url)),f);
 assert(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').includes('本机保存'));
});
