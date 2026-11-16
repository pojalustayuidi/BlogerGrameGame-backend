'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {newToken,isToken,tokenHash,parseBearer}=require('../lib/guestTokens');
const {createGuestLimiter}=require('../lib/guestLimiter');
const {ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN, publicPlayer}=require('../services/guestAuthService');
const SQL=fs.readFileSync(path.join(__dirname,'..','db','migrations','002_guest_sessions.sql'),'utf8');

test('guest tokens contain 256 bits of randomness in URL-safe form',()=>{
  const a=newToken(),b=newToken();
  assert.equal(a.length,43); assert.equal(isToken(a),true); assert.notEqual(a,b);
  assert.equal(Buffer.from(a,'base64url').length,32);
});
test('tokens are hashed with SHA-256; raw token is not stored',()=>{
  const token=newToken(), hash=tokenHash(token);
  assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(hash.includes(token),false);
  assert.notEqual(hash,token);assert.equal(tokenHash(token),hash);
});
test('invalid tokens are rejected before hashing',()=>{
  for(const invalid of [undefined,null,'', 'a'.repeat(42), 'a'.repeat(44), 'secret token', 42]){
    assert.equal(isToken(invalid),false);
    assert.throws(()=>tokenHash(invalid),TypeError);
  }
});
test('bearer parsing only accepts a single opaque token',()=>{
  const t=newToken();
  assert.equal(parseBearer(`Bearer ${t}`),t);
  assert.equal(parseBearer(`bearer ${t}`),t);
  for(const bad of [undefined,`Basic ${t}`,`Bearer ${t} extra`,`Bearer  ${t}`,t,'Bearer bad'])
    assert.equal(parseBearer(bad),null);
});
test('guest sessions table stores hashes and expiration/revocation data',()=>{
  for(const col of ['access_token_hash','refresh_token_hash','access_expires_at','refresh_expires_at','revoked_at','player_id']){
    assert.match(SQL,new RegExp(`\\b${col}\\b`));
  }
  assert.match(SQL,/ON DELETE CASCADE/);assert.match(SQL,/ADD COLUMN is_guest/);
});
test('access and refresh lifetimes are explicitly bounded',()=>{
  assert.equal(ACCESS_EXPIRES_IN,900);
  assert.equal(REFRESH_EXPIRES_IN,30*24*60*60);
});
test('public player has limited fields and does not include internal hashes',()=>{
  const p=publicPlayer({id:'id',coins:30,lives:5,hints:2,is_guest:true,created_at:'date',access_token_hash:'secret'});
  assert.deepEqual(Object.keys(p),['id','coins','lives','hints','isGuest','createdAt']);
  assert.equal(p.isGuest,true);
});
test('local guest limiter blocks excessive guest creation',()=>{
  let clock=1000;let passes=0;const res={set(){return this;},status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return this;}};
  const limit=createGuestLimiter({max:2,windowMs:1000,now:()=>clock});
  const req={socket:{remoteAddress:'127.0.0.1'}};
  limit(req,res,()=>passes++);limit(req,res,()=>passes++);
  assert.equal(passes,2);
  limit(req,res,()=>passes++);
  assert.equal(res.statusCode,429);assert.equal(res.payload.error,'GUEST_RATE_LIMITED');
  clock+=1001;limit(req,res,()=>passes++);assert.equal(passes,3);
});
