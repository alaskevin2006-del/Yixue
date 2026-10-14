import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.js';
import { bootstrapAdmin, createAuth, hashPassword } from '../../server/auth.js';

test('revoked administrator session cannot finish a delayed account toggle',async()=>{
  const store=new Store(':memory:');
  try{
    await bootstrapAdmin(store,{adminUsername:'admin',adminPassword:'old-secret-password'});const auth=createAuth(store,{});
    const login=await auth.handle({method:'POST',path:'/api/auth/login',req:{headers:{},socket:{remoteAddress:'127.0.0.1'}},body:async()=>({username:'admin',password:'old-secret-password'})});
    const req={headers:{cookie:login.headers['set-cookie'].split(';')[0]}};
    const created=await auth.handle({method:'POST',path:'/api/admin/users',principal:login.body.user,req,body:async()=>({username:'target',password:'target-password'})});
    let release;const pending=auth.handle({method:'PATCH',path:`/api/admin/users/${created.body.user.id}`,principal:login.body.user,req,body:()=>new Promise(resolve=>{release=resolve;})});
    store.run('DELETE FROM sessions');release({disabled:true});
    await assert.rejects(pending,e=>e.code==='AUTH_REQUIRED');
    assert.equal(store.get('SELECT disabled FROM users WHERE id=?',created.body.user.id).disabled,0);
  }finally{store.close();}
});

test('password reset during pending login cannot mint a session using the revoked old password',async()=>{
  const store=new Store(':memory:');
  try{
    await bootstrapAdmin(store,{adminUsername:'admin',adminPassword:'old-secret-password'});
    const replacement=await hashPassword('replacement-password');const auth=createAuth(store,{});
    const pending=auth.handle({method:'POST',path:'/api/auth/login',req:{headers:{},socket:{remoteAddress:'127.0.0.1'}},body:async()=>({username:'admin',password:'old-secret-password'})});
    // Login has read the original hash and is awaiting real asynchronous scrypt.
    await Promise.resolve();store.run('UPDATE users SET password_hash=?',replacement);store.run('DELETE FROM sessions');
    await assert.rejects(pending,e=>e.code==='INVALID_CREDENTIALS');
    assert.equal(store.get('SELECT count(*) AS n FROM sessions').n,0);
  }finally{store.close();}
});

test('pending password change cannot overwrite a later admin reset after its session is revoked',async()=>{
  const store=new Store(':memory:');
  try{
    await bootstrapAdmin(store,{adminUsername:'admin',adminPassword:'old-secret-password'});
    const replacement=await hashPassword('replacement-password'),auth=createAuth(store,{});
    const login=await auth.handle({method:'POST',path:'/api/auth/login',req:{headers:{},socket:{remoteAddress:'127.0.0.1'}},body:async()=>({username:'admin',password:'old-secret-password'})});
    const pending=auth.handle({method:'POST',path:'/api/auth/password',principal:login.body.user,req:{headers:{cookie:login.headers['set-cookie'].split(';')[0]}},body:async()=>({currentPassword:'old-secret-password',newPassword:'stale-change-password'})});
    await Promise.resolve();store.run('UPDATE users SET password_hash=?',replacement);store.run('DELETE FROM sessions');
    await assert.rejects(pending,e=>e.code==='AUTH_REQUIRED');
    assert.equal(store.get('SELECT password_hash FROM users').password_hash,replacement);
  }finally{store.close();}
});
