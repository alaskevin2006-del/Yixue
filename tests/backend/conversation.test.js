import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SQLiteRepository} from '../../server/db/sqlite.js';
import {ConversationService} from '../../server/domain.js';
test('existing SQLite conversations persist and reject cross-owner access',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'yixue-test-'));const path=join(dir,'test.sqlite');let repo=new SQLiteRepository(path);
 try{const service=new ConversationService(repo);const subject=await service.createSubject('user-a',{name:'C++'});const c=await service.createConversation('user-a',subject.id,{});
 await service.appendUserMessage('user-a',c.id,{content:'hello',requestId:'id-1'});
 await assert.rejects(service.getConversation('user-b',c.id));await repo.close();repo=new SQLiteRepository(path);
 assert.equal((await new ConversationService(repo).listMessages('user-a',c.id))[0].content,'hello');
 }finally{await repo.close();rmSync(dir,{recursive:true,force:true});}
});
