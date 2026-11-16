'use strict';
// Real HTTP + PostgreSQL integration smoke test. Deletes ONLY the guest it creates.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const pool=require('../db');
const root=path.join(__dirname,'..');

async function findFreePort() {
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  return port;
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function awaitHealthy(base,child) {
  for (let i=0;i<75;i++) {
    if (child.exitCode!==null) throw new Error(`Smoke test backend exited: ${child.exitCode}`);
    try {const r=await fetch(`${base}/health`);if (r.ok) return;} catch(_){}
    await delay(100);
  }
  throw new Error('Smoke server did not become healthy (check PostgreSQL and migration 002)');
}
async function call(base,method,endpoint,token,body) {
  const headers={};
  if (token) headers.Authorization=`Bearer ${token}`;
  if (body!==undefined) headers['Content-Type']='application/json';
  const r=await fetch(`${base}${endpoint}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  let json=null;
  if (r.status!==204) json=await r.json();
  return {status:r.status,body:json};
}
async function smoke() {
  const port=await findFreePort(), base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['index.js'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let guestId=null,childOutput='';
  child.stderr.on('data',b=>childOutput+=(String(b)).slice(0,1000));
  child.stdout.on('data',b=>childOutput+=(String(b)).slice(0,1000));
  try {
    await awaitHealthy(base,child);
    const anon=await call(base,'GET','/api/v1/auth/me');
    assert.equal(anon.status,401);
    const invalid=await call(base,'POST','/api/v1/auth/guest',null,{playerId:'fake',coins:999999});
    assert.equal(invalid.status,400,'Guest creation must reject user-supplied ID/balance');

    const guest=await call(base,'POST','/api/v1/auth/guest',null,{});
    assert.equal(guest.status,201);
    guestId=guest.body.player?.id;
    assert.match(guestId,/^[0-9a-f-]{36}$/i);
    assert.equal(guest.body.player.coins,30);
    assert.equal(guest.body.player.isGuest,true);
    assert.equal(typeof guest.body.accessToken,'string');
    assert.equal(typeof guest.body.refreshToken,'string');
    const rawAccess=guest.body.accessToken;
    const rawRefresh=guest.body.refreshToken;
    const me=await call(base,'GET','/api/v1/auth/me',rawAccess);
    assert.equal(me.status,200);
    assert.equal(me.body.player.id,guestId);
    console.log('PASS: guest created with server-owned UUID and default balances');
    console.log('PASS: bearer token retrieves own player; anonymous access rejected');

    const rotated=await call(base,'POST','/api/v1/auth/refresh',null,{refreshToken:rawRefresh});
    assert.equal(rotated.status,200);
    assert.notEqual(rotated.body.accessToken,rawAccess);
    assert.notEqual(rotated.body.refreshToken,rawRefresh);
    const oldAccess=await call(base,'GET','/api/v1/auth/me',rawAccess);
    const oldRefresh=await call(base,'POST','/api/v1/auth/refresh',null,{refreshToken:rawRefresh});
    assert.equal(oldAccess.status,401);
    assert.equal(oldRefresh.status,401);
    const active=await call(base,'GET','/api/v1/auth/me',rotated.body.accessToken);
    assert.equal(active.status,200);
    assert.equal(active.body.player.id,guestId);
    console.log('PASS: refresh rotates both tokens, invalidating old access and refresh');

    const logout=await call(base,'POST','/api/v1/auth/logout',rotated.body.accessToken);
    assert.equal(logout.status,204);
    const afterLogout=await call(base,'GET','/api/v1/auth/me',rotated.body.accessToken);
    const refreshAfterLogout=await call(base,'POST','/api/v1/auth/refresh',null,{refreshToken:rotated.body.refreshToken});
    assert.equal(afterLogout.status,401);
    assert.equal(refreshAfterLogout.status,401);
    console.log('PASS: logout revokes the active session and its refresh token');
  } catch (e) {
    if(childOutput) console.error('Backend output (truncated):',childOutput.slice(0,1200));
    throw e;
  } finally {
    child.kill('SIGTERM');
    if (guestId) {
      // Only delete the exact guest created here. ON DELETE CASCADE cleans sessions.
      try {await pool.query('DELETE FROM players WHERE id=$1 AND is_guest=TRUE',[guestId]);
        console.log('PASS: temporary smoke guest removed; existing players preserved');}
      catch(e){console.error('WARNING: cleanup failed:',e.message);process.exitCode=1;}
    }
    await pool.end();
  }
}
smoke().catch(e=>{console.error(`Auth smoke failed: ${e.stack||e.message}`);process.exitCode=1;});
