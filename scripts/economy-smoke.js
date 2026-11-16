'use strict';
// Independent localhost HTTP + PostgreSQL test; all data belongs to a temporary guest.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const pool=require('../db');
const {splitQuote}=require('../lib/puzzleText');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const s=net.createServer();await new Promise((ok,bad)=>s.once('error',bad).listen(0,'127.0.0.1',ok));
  const p=s.address().port;await new Promise((ok,bad)=>s.close(e=>e?bad(e):ok()));return p;}
async function ping(base,child){for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('Backend exited');try{if((await fetch(base+'/health')).ok)return;}catch(_){}await sleep(100);
}throw new Error('Backend health timeout');}
async function api(base,method,url,token,body){const headers={};if(token)headers.Authorization='Bearer '+token;
  if(body!==undefined)headers['Content-Type']='application/json';const r=await fetch(base+url,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:r.status===204?null:await r.json()};}
async function run(){
  const port=await freePort(),base=`http://127.0.0.1:${port}`,root='/api/v1/game';
  const child=spawn(process.execPath,['index.js'],{cwd:path.join(__dirname,'..'),
    env:{...process.env,PORT:String(port),LOCAL_DRAFT_PREVIEW:'1'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',x=>logs+=String(x).slice(0,500));child.stderr.on('data',x=>logs+=String(x).slice(0,500));
  let playerId=null;
  try{
    await ping(base,child);
    const guest=await api(base,'POST','/api/v1/auth/guest',null,{});
    assert.equal(guest.status,201);playerId=guest.data.player.id;const token=guest.data.accessToken;
    const wallet=await api(base,'GET',root+'/wallet',token);
    assert.equal(wallet.status,200);assert.equal(wallet.data.wallet.coins,30);
    assert.equal(wallet.data.wallet.lives,5);assert.equal(wallet.data.wallet.hints,2);
    assert.equal(wallet.data.wallet.lifeRegenMinutes,30);
    const shop=await api(base,'GET',root+'/shop',token);
    assert.equal(shop.status,200);const life=shop.data.offers.find(o=>o.sku==='life_1');
    assert.equal(life.costCoins,50);
    const requestId=randomUUID();
    const fail=await api(base,'POST',root+'/shop/purchases',token,{sku:'hint_1',requestId});
    assert.equal(fail.status,409);assert.equal(fail.data.error,'NOT_ENOUGH_COINS');
    await pool.query('UPDATE players SET coins=230 WHERE id=$1',[playerId]);
    const purchased=await api(base,'POST',root+'/shop/purchases',token,{sku:'hint_1',requestId});
    assert.equal(purchased.status,200);assert.equal(purchased.data.applied,true);
    assert.equal(purchased.data.wallet.coins,185);assert.equal(purchased.data.wallet.hints,3);
    const duplicate=await api(base,'POST',root+'/shop/purchases',token,{sku:'hint_1',requestId});
    assert.equal(duplicate.status,200);assert.equal(duplicate.data.applied,false);
    const conflict=await api(base,'POST',root+'/shop/purchases',token,{sku:'life_1',requestId});
    assert.equal(conflict.status,409);assert.equal(conflict.data.error,'REQUEST_ID_CONFLICT');
    console.log('PASS: server-owned shop prices and idempotent purchases');
    const levels=(await api(base,'GET',root+'/levels?category=streamers',token)).data.levels;
    const start=await api(base,'POST',root+`/levels/${levels[0].id}/attempts`,token,{});
    assert.equal(start.status,201);const a=start.data.attempt;
    const available=a.layout.filter(c=>c.type==='letter'&&c.given===null);
    const chosen=available.find(c=>available.some(d=>d.number===c.number&&d.position!==c.position));
    assert.ok(chosen);const other=available.find(d=>d.number===chosen.number&&d.position!==chosen.position);
    const hint=await api(base,'POST',root+`/attempts/${a.id}/hints/reveal`,token,{position:chosen.position});
    assert.equal(hint.status,200,JSON.stringify(hint.data));assert.equal(hint.data.applied,true);
    assert.equal(hint.data.wallet.hints,2);
    const replay=await api(base,'POST',root+`/attempts/${a.id}/hints/reveal`,token,{position:chosen.position});
    assert.equal(replay.status,200);assert.equal(replay.data.applied,false);
    const state=await api(base,'GET',root+`/attempts/${a.id}`,token);
    assert.equal(state.data.attempt.layout[chosen.position].hinted,true);
    assert.equal(state.data.attempt.layout[other.position].letter,null);
    const locked=await api(base,'PATCH',root+`/attempts/${a.id}/cells/${chosen.position}`,token,{letter:'Я',requestId:randomUUID()});
    assert.equal(locked.status,409);assert.equal(locked.data.error,'CELL_LOCKED');
    console.log('PASS: one-cell hint costs once, is immutable, and never auto-fills equal numbers');
    // Zero lives should block even a correct letter, without losing progress.
    await pool.query('UPDATE players SET lives=0,life_regen_at=NOW() WHERE id=$1',[playerId]);
    const quote=(await pool.query(`SELECT q.quote_text FROM puzzle_attempts p JOIN levels l ON l.id=p.level_id
      JOIN quotes q ON q.id=l.quote_id WHERE p.id=$1`,[a.id])).rows[0].quote_text;
    const letters=splitQuote(quote);
    const blocked=await api(base,'PATCH',root+`/attempts/${a.id}/cells/${other.position}`,token,
      {letter:letters[other.position],requestId:randomUUID()});
    assert.equal(blocked.status,409);assert.equal(blocked.data.error,'NO_LIVES');
    const blockedHint=await api(base,'POST',root+`/attempts/${a.id}/hints/reveal`,token,{position:other.position});
    assert.equal(blockedHint.status,409);assert.equal(blockedHint.data.error,'NO_LIVES');
    const purchaseLife=await api(base,'POST',root+'/shop/purchases',token,{sku:'life_1',requestId:randomUUID()});
    assert.equal(purchaseLife.status,200);assert.equal(purchaseLife.data.wallet.coins,135);
    assert.equal(purchaseLife.data.wallet.lives,1);
    const restored=await api(base,'PATCH',root+`/attempts/${a.id}/cells/${other.position}`,token,
      {letter:letters[other.position],requestId:randomUUID()});
    assert.equal(restored.status,200);assert.equal(restored.data.correct,true);
    console.log('PASS: zero lives blocks input and hints; buying one life unlocks play');
    // Two minutes past a two-life regeneration: 2 lives restored, leftover time preserved.
    await pool.query("UPDATE players SET lives=1,life_regen_at=NOW()-INTERVAL '65 minutes' WHERE id=$1",[playerId]);
    const healed=await api(base,'GET',root+'/wallet',token);
    assert.equal(healed.data.wallet.lives,3);
    assert.ok(healed.data.wallet.nextLifeAt);
    console.log('PASS: 30-minute regeneration works without a background timer');
    // Make a second attempt fully correct, with the last cell provided via hint.
    const second=await api(base,'POST',root+`/levels/${levels[1].id}/attempts`,token,{});
    assert.equal(second.status,201);const b=second.data.attempt;
    const quote2=(await pool.query(`SELECT q.quote_text FROM puzzle_attempts p JOIN levels l ON l.id=p.level_id
      JOIN quotes q ON q.id=l.quote_id WHERE p.id=$1`,[b.id])).rows[0].quote_text;
    const letters2=splitQuote(quote2);const open=b.layout.filter(c=>c.type==='letter'&&c.given===null);
    const last=open.pop();assert.ok(last);
    for(const c of open){const reply=await api(base,'PATCH',root+`/attempts/${b.id}/cells/${c.position}`,token,
      {letter:letters2[c.position],requestId:randomUUID()});
      assert.equal(reply.status,200,'Cannot enter letter: '+JSON.stringify(reply.data));assert.equal(reply.data.solved,false);
    }
    const finish=await api(base,'POST',root+`/attempts/${b.id}/hints/reveal`,token,{position:last.position});
    assert.equal(finish.status,200,JSON.stringify(finish.data));assert.equal(finish.data.solved,true);
    assert.ok(finish.data.rewardCoins>0);assert.equal(finish.data.flawless,false);
    assert.equal((await api(base,'POST',root+`/attempts/${b.id}/hints/reveal`,token,{position:last.position})).status,409);
    const entries=await api(base,'GET',root+'/wallet/history',token);
    assert.equal(entries.status,200);
    assert.equal(entries.data.events.filter(x=>x.type==='shop_purchase').length,2);
    assert.equal(entries.data.events.filter(x=>x.type==='hint_reveal').length,2);
    assert.equal(entries.data.events.filter(x=>x.type==='level_reward').length,1);
    console.log('PASS: last hinted cell completes puzzle; level reward issued exactly once');
  }catch(e){console.error('Backend logs:',logs.slice(0,1200));throw e;}
  finally{child.kill('SIGTERM');if(playerId){try{
    await pool.query('DELETE FROM level_progress WHERE player_id=$1',[playerId]);
    await pool.query('DELETE FROM players WHERE id=$1',[playerId]);
    console.log('PASS: temporary test guest and all of its operations deleted');
  }catch(e){console.error('Smoke cleanup failed:',e);process.exitCode=1;}}await pool.end();}
}
run().catch(e=>{console.error('Economy smoke failed:',e.stack||e.message);process.exitCode=1;});
