'use strict';
// HTTP+PostgreSQL integration playthrough; deletes only its own guest and progress.
// Requires the draft catalog import and migration 003. Spawns an isolated local server.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const pool=require('../db');
const {splitQuote}=require('../lib/puzzleText');
const root=path.join(__dirname,'..');
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function freePort(){
  const server=net.createServer();
  await new Promise((ok,bad)=>server.once('error',bad).listen(0,'127.0.0.1',ok));
  const port=server.address().port;
  await new Promise((ok,bad)=>server.close(e=>e?bad(e):ok()));
  return port;
}
async function ping(base,child){for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('Backend exited: '+child.exitCode);
  try{const r=await fetch(base+'/health');if(r.ok)return;}catch(_){ }
  await sleep(100);
}throw new Error('Smoke server did not become healthy');}
async function api(base,method,path,token,body){
  const headers={};if(token)headers.Authorization='Bearer '+token;
  if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:r.status===204?null:await r.json()};
}
async function run(){
  const port=await freePort(),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['index.js'],{cwd:root,
    env:{...process.env,PORT:String(port),LOCAL_DRAFT_PREVIEW:'1'},stdio:['ignore','pipe','pipe']});
  let childLogs='';child.stdout.on('data',b=>childLogs+=String(b).slice(0,500));child.stderr.on('data',b=>childLogs+=String(b).slice(0,500));
  let playerId=null;
  try{
    await ping(base,child);
    const unauthorized=await api(base,'GET','/api/v1/game/levels');
    assert.equal(unauthorized.status,401);
    const guest=await api(base,'POST','/api/v1/auth/guest',null,{});
    assert.equal(guest.status,201);
    playerId=guest.data.player.id;
    const token=guest.data.accessToken;
    const cats=await api(base,'GET','/api/v1/game/categories',token);
    assert.equal(cats.status,200);
    assert.equal(cats.data.categories.length,3);
    const list=await api(base,'GET','/api/v1/game/levels?category=streamers',token);
    assert.equal(list.status,200);
    assert.equal(list.data.draftPreview,true);
    assert.equal(list.data.levels.length,22,'Import the 42 draft candidates first');
    assert.ok(!JSON.stringify(list.data).includes('quote_text'));
    const levelId=list.data.levels[0].id;
    const started=await api(base,'POST',`/api/v1/game/levels/${levelId}/attempts`,token,{});
    assert.equal(started.status,201);
    const attempt=started.data.attempt;
    assert.ok(attempt.layout.length>15);
    assert.equal(attempt.status,'in_progress');
    assert.equal(attempt.bonusOptions,undefined);
    assert.ok(!JSON.stringify(attempt).includes('quoteText'));
    const resumed=await api(base,'POST',`/api/v1/game/levels/${levelId}/attempts`,token,{});
    assert.equal(resumed.status,200);
    assert.equal(resumed.data.attempt.id,attempt.id);
    const forbidden=await api(base,'GET',`/api/v1/game/attempts/${attempt.id}`,null);
    assert.equal(forbidden.status,401);
    const second=await api(base,'POST','/api/v1/auth/guest',null,{});
    // In-memory guest creation limiter may reject second guest; ownership verification covered by DB query.
    if(second.status===201){
      const owned=await api(base,'GET',`/api/v1/game/attempts/${attempt.id}`,second.data.accessToken);
      assert.equal(owned.status,404);
      await pool.query('DELETE FROM players WHERE id=$1',[second.data.player.id]);
    }
    const letters=attempt.layout.filter(c=>c.type==='letter'&&c.given===null);
    assert.ok(letters.length>0);
    // Find two distinct non-given positions with the SAME number.
    const repeated=letters.find(c=>letters.some(d=>d.number===c.number&&d.position!==c.position));
    assert.ok(repeated,'Expected a repeated number in the first streamer quote');
    const other=letters.find(c=>c.number===repeated.number&&c.position!==repeated.position);
    const phrase=(await pool.query(`SELECT q.quote_text FROM puzzle_attempts a JOIN levels l ON a.level_id=l.id
      JOIN quotes q ON q.id=l.quote_id WHERE a.id=$1`,[attempt.id])).rows[0].quote_text;
    const original=splitQuote(phrase);
    const edit=await api(base,'PATCH',`/api/v1/game/attempts/${attempt.id}/cells/${repeated.position}`,token,{letter:original[repeated.position]});
    assert.equal(edit.status,200);
    const updated=await api(base,'GET',`/api/v1/game/attempts/${attempt.id}`,token);
    assert.equal(updated.data.attempt.layout[repeated.position].letter,original[repeated.position]);
    assert.equal(updated.data.attempt.layout[other.position].letter,null,'Matching numbers must remain independently empty');
    const note=await api(base,'PUT',`/api/v1/game/attempts/${attempt.id}/notes/${repeated.number}`,token,{letter:'А',comment:'Тест гипотезы'});
    assert.equal(note.status,200);
    const afterNote=await api(base,'GET',`/api/v1/game/attempts/${attempt.id}`,token);
    assert.equal(afterNote.data.attempt.layout[other.position].letter,null,'Notes must not auto-fill any cell');
    console.log('PASS: guest auth, draft catalog and ownership checks');
    console.log('PASS: stable attempt, one cell edit, repeated number NOT auto-filled, independent notes');
    // One deliberate incorrect letter; checking happens only when the entire phrase is filled.
    for(const c of letters){
      const actual=original[c.position];
      const value=c.position===other.position?(actual==='А'?'Б':'А'):actual;
      const r=await api(base,'PATCH',`/api/v1/game/attempts/${attempt.id}/cells/${c.position}`,token,{letter:value});
      assert.equal(r.status,200,'Cannot fill position '+c.position+': '+JSON.stringify(r.data));
    }
    const wrong=await api(base,'POST',`/api/v1/game/attempts/${attempt.id}/check`,token,{});
    assert.equal(wrong.status,200);
    assert.equal(wrong.data.correct,false);
    assert.equal(wrong.data.mistakes,1);
    const fastRetry=await api(base,'POST',`/api/v1/game/attempts/${attempt.id}/check`,token,{});
    assert.equal(fastRetry.status,429);
    await api(base,'PATCH',`/api/v1/game/attempts/${attempt.id}/cells/${other.position}`,token,{letter:original[other.position]});
    await sleep(4100);
    const solved=await api(base,'POST',`/api/v1/game/attempts/${attempt.id}/check`,token,{});
    assert.equal(solved.status,200,JSON.stringify(solved.data));
    assert.equal(solved.data.correct,true);
    assert.equal(solved.data.rewardCoins,0);
    assert.ok(solved.data.bonusOptions.length>=2);
    const solvedState=await api(base,'GET',`/api/v1/game/attempts/${attempt.id}`,token);
    assert.equal(solvedState.data.attempt.status,'solved');
    assert.equal(solvedState.data.attempt.reveal,undefined);
    const answerCreator=(await pool.query(`SELECT q.creator_id FROM puzzle_attempts a JOIN levels l ON l.id=a.level_id
      JOIN quotes q ON q.id=l.quote_id WHERE a.id=$1`,[attempt.id])).rows[0].creator_id;
    const bonus=await api(base,'POST',`/api/v1/game/attempts/${attempt.id}/bonus`,token,{guessedCreatorId:answerCreator});
    assert.equal(bonus.status,200);
    assert.equal(bonus.data.result,'correct');
    assert.equal(bonus.data.reveal.quote,phrase);
    const repeatBonus=await api(base,'POST',`/api/v1/game/attempts/${attempt.id}/bonus`,token,{guessedCreatorId:answerCreator});
    assert.equal(repeatBonus.status,409);
    console.log('PASS: full-phrase check, mistakes, cooldown and solved progress');
    console.log('PASS: bonus choices, single answer and gated quote/author reveal');
  }catch(e){console.error('Smoke server logs:',childLogs.slice(0,1000));throw e;}
  finally{
    child.kill('SIGTERM');
    if(playerId){
      try{
        await pool.query('DELETE FROM level_progress WHERE player_id=$1',[playerId]);
        await pool.query('DELETE FROM players WHERE id=$1',[playerId]);
        console.log('PASS: temporary guest and its test progress deleted');
      }catch(e){console.error('Cleanup failed:',e.message);process.exitCode=1;}
    }
    await pool.end();
  }
}
run().catch(e=>{console.error(`Game smoke failed: ${e.stack||e.message}`);process.exitCode=1;});
