'use strict';
// End-to-end local-only HTTP/PostgreSQL test. Deletes only the guest it creates.
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
  if(child.exitCode!==null)throw new Error('Backend exited: '+child.exitCode);
  try{const r=await fetch(base+'/health');if(r.ok)return;}catch(_){}await sleep(100);
}throw new Error('Smoke server did not start');}
async function api(base,method,url,token,body){const headers={};if(token)headers.Authorization='Bearer '+token;
  if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(base+url,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:r.status===204?null:await r.json()};}
async function run(){
  const port=await freePort(),base=`http://127.0.0.1:${port}`,prefix='/api/v1/game';
  const child=spawn(process.execPath,['index.js'],{cwd:path.join(__dirname,'..'),
    env:{...process.env,PORT:String(port),LOCAL_DRAFT_PREVIEW:'1'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=String(b).slice(0,400));child.stderr.on('data',b=>logs+=String(b).slice(0,400));
  let playerId=null;
  try{
    await ping(base,child);
    assert.equal((await api(base,'GET',prefix+'/levels')).status,401);
    const guest=await api(base,'POST','/api/v1/auth/guest',null,{});
    assert.equal(guest.status,201);playerId=guest.data.player.id;const token=guest.data.accessToken;
    const levels=await api(base,'GET',prefix+'/levels?category=streamers',token);
    assert.equal(levels.status,200);assert.equal(levels.data.levels.length,22);
    assert.ok(!JSON.stringify(levels.data).includes('quote_text'));
    const levelId=levels.data.levels[0].id;
    const start=await api(base,'POST',prefix+`/levels/${levelId}/attempts`,token,{});
    assert.equal(start.status,201);const a=start.data.attempt;
    assert.equal(a.triesRemaining,3);assert.equal(a.status,'in_progress');
    const resumed=await api(base,'POST',prefix+`/levels/${levelId}/attempts`,token,{});
    assert.equal(resumed.status,200);assert.equal(resumed.data.attempt.id,a.id);
    const chars=splitQuote((await pool.query(`SELECT q.quote_text FROM puzzle_attempts p
      JOIN levels l ON l.id=p.level_id JOIN quotes q ON q.id=l.quote_id WHERE p.id=$1`,[a.id])).rows[0].quote_text);
    const available=a.layout.filter(x=>x.type==='letter'&&x.given===null);
    const one=available.find(x=>available.some(y=>y.number===x.number&&y.position!==x.position));
    assert.ok(one,'Need a pair of equal numbers');const other=available.find(x=>x.number===one.number&&x.position!==one.position);
    const editUrl=position=>prefix+`/attempts/${a.id}/cells/${position}`;
    const bad=chars[one.position]==='А'?'Б':'А';const firstRequest=randomUUID();
    const firstWrong=await api(base,'PATCH',editUrl(one.position),token,{letter:bad,requestId:firstRequest});
    assert.equal(firstWrong.status,200,JSON.stringify(firstWrong.data));assert.equal(firstWrong.data.correct,false);
    assert.equal(firstWrong.data.triesRemaining,2);assert.equal(firstWrong.data.mistakes,1);
    const dup=await api(base,'PATCH',editUrl(one.position),token,{letter:bad,requestId:firstRequest});
    assert.equal(dup.status,200);assert.equal(dup.data.replayed,true);assert.equal(dup.data.mistakes,1);
    const conflict=await api(base,'PATCH',editUrl(one.position),token,{letter:chars[one.position],requestId:firstRequest});
    assert.equal(conflict.status,409);assert.equal(conflict.data.error,'REQUEST_ID_CONFLICT');
    const empty=await api(base,'GET',prefix+`/attempts/${a.id}`,token);
    assert.equal(empty.data.attempt.layout[one.position].letter,null,'Wrong letter must not be persisted');
    const secondWrong=await api(base,'PATCH',editUrl(one.position),token,{letter:bad,requestId:randomUUID()});
    assert.equal(secondWrong.data.triesRemaining,1);assert.equal(secondWrong.data.lostLife,false);
    const thirdWrong=await api(base,'PATCH',editUrl(one.position),token,{letter:bad,requestId:randomUUID()});
    assert.equal(thirdWrong.data.triesRemaining,3);assert.equal(thirdWrong.data.lostLife,true);
    assert.equal(thirdWrong.data.wallet.lives,4);
    const right=await api(base,'PATCH',editUrl(one.position),token,{letter:chars[one.position],requestId:randomUUID()});
    assert.equal(right.status,200);assert.equal(right.data.correct,true);assert.equal(right.data.solved,false);
    const state=await api(base,'GET',prefix+`/attempts/${a.id}`,token);
    assert.equal(state.data.attempt.layout[one.position].letter,chars[one.position]);
    assert.equal(state.data.attempt.layout[other.position].letter,null,'Matching number must not autofill');
    const note=await api(base,'PUT',prefix+`/attempts/${a.id}/notes/${one.number}`,token,{letter:'А',comment:'Гипотеза'});
    assert.equal(note.status,200);
    const locked=await api(base,'PATCH',editUrl(one.position),token,{letter:'Я',requestId:randomUUID()});
    assert.equal(locked.status,409);assert.equal(locked.data.error,'CELL_ALREADY_CORRECT');
    assert.equal((await api(base,'POST',prefix+`/attempts/${a.id}/check`,token,{})).status,410);
    console.log('PASS: immediate wrong-letter feedback, 3 tries = 1 life, retry idempotency');
    console.log('PASS: one cell accepted, matching number not filled, independent notes');
    let won=null;
    for(const c of available){
      if(c.position===one.position)continue;
      const reply=await api(base,'PATCH',editUrl(c.position),token,{letter:chars[c.position],requestId:randomUUID()});
      assert.equal(reply.status,200,'Unable to complete '+c.position+': '+JSON.stringify(reply.data));
      assert.equal(reply.data.correct,true);
      if(reply.data.solved)won=reply.data;
    }
    assert.ok(won,'Last manually filled cell must auto-complete the level');
    assert.ok(won.rewardCoins>0);assert.equal(won.flawless,false);
    assert.ok(won.bonusOptions.length>=2);
    const done=await api(base,'GET',prefix+`/attempts/${a.id}`,token);
    assert.equal(done.data.attempt.status,'solved');assert.equal(done.data.attempt.reveal,undefined);
    const levelProgress=await pool.query('SELECT 1 FROM level_progress WHERE player_id=$1 AND level_id=$2',[playerId,levelId]);
    assert.equal(levelProgress.rowCount,1);
    const owner=(await pool.query(`SELECT q.creator_id,q.quote_text FROM puzzle_attempts p
      JOIN levels l ON l.id=p.level_id JOIN quotes q ON q.id=l.quote_id WHERE p.id=$1`,[a.id])).rows[0];
    const bonus=await api(base,'POST',prefix+`/attempts/${a.id}/bonus`,token,{guessedCreatorId:owner.creator_id});
    assert.equal(bonus.status,200);assert.equal(bonus.data.result,'correct');assert.equal(bonus.data.rewardCoins,10);
    assert.equal(bonus.data.reveal.quote,owner.quote_text);
    assert.equal((await api(base,'POST',prefix+`/attempts/${a.id}/bonus`,token,{guessedCreatorId:owner.creator_id})).status,409);
    const rewards=await pool.query("SELECT event_type FROM economy_ledger WHERE player_id=$1 AND event_type IN ('level_reward','bonus_reward')",[playerId]);
    assert.equal(rewards.rowCount,2);
    console.log('PASS: last correct cell auto-solves, one reward and gated bonus reveal');
  }catch(e){console.error('Backend logs:',logs.slice(0,1400));throw e;}
  finally{child.kill('SIGTERM');if(playerId){
    try{await pool.query('DELETE FROM level_progress WHERE player_id=$1',[playerId]);
      await pool.query('DELETE FROM players WHERE id=$1',[playerId]);
      console.log('PASS: temporary guest and its test data removed');}
    catch(e){console.error('Cleanup failed:',e);process.exitCode=1;}}
    await pool.end();}
}
run().catch(e=>{console.error('Game smoke failed:',e.stack||e.message);process.exitCode=1;});
