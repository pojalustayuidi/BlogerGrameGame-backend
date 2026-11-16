'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {RULES,SHOP,quoteReward,regenLives,costsLifeOnWrongLetter}=require('../lib/economyRules');
const sql=fs.readFileSync(path.join(__dirname,'..','db','migrations','004_economy.sql'),'utf8');
const game=fs.readFileSync(path.join(__dirname,'..','services','gameService.js'),'utf8');
const eco=fs.readFileSync(path.join(__dirname,'..','services','economyService.js'),'utf8');
test('Playtest rewards align with all four difficulty tiers',()=>{
  assert.deepEqual(['easy','normal','hard','expert'].map(quoteReward),[20,30,40,55]);
  assert.equal(RULES.bonusCorrect,10);assert.equal(RULES.flawless,5);
});
test('Shop discounts are real and prices are entirely server-defined',()=>{
  assert.equal(SHOP.hint_1.costCoins,45);
  assert.equal(SHOP.hint_3.costCoins,120);
  assert.equal(SHOP.life_1.costCoins,50);
  assert.equal(SHOP.life_3.costCoins,120);
  assert.equal(RULES.regenMinutes,30);
  assert.equal(RULES.wrongLettersPerLife,3);
  assert.ok(SHOP.hint_3.costCoins<SHOP.hint_1.costCoins*3);
  assert.ok(SHOP.life_3.costCoins<SHOP.life_1.costCoins*3);
});
test('Each wrong letter spends a try; every third wrong letter costs one life',()=>{
  assert.deepEqual(Array.from({length:9},(_,i)=>costsLifeOnWrongLetter(i+1)),
    [false,false,true,false,false,true,false,false,true]);
});
test('Life recovery preserves leftover minutes and caps at five',()=>{
  const at='2026-11-16T10:00:00Z';
  const r=regenLives(1,at,'2026-11-16T10:45:00Z');
  assert.equal(r.lives,2);
  assert.equal(r.nextLifeAt.toISOString(),'2026-11-16T11:00:00.000Z');
  const capped=regenLives(3,at,'2026-11-16T12:00:00Z');
  assert.equal(capped.lives,5);assert.equal(capped.nextLifeAt,null);
  assert.equal(regenLives(0,at,'2026-11-16T10:29:59Z').lives,0);
});
test('Economy migration links hint to physical cell and has unique events',()=>{
  assert.match(sql,/UNIQUE\s*\(player_id,event_key\)/);
  assert.match(sql,/PRIMARY KEY\(attempt_id,cell_position\)/);
  assert.match(sql,/REFERENCES puzzle_cells\(attempt_id,cell_position\)/);
  assert.match(sql,/life_regen_at TIMESTAMPTZ/);
});
test('Game payouts and hints do not bypass owner and attempt locks',()=>{
  assert.match(game,/getAttemptRow\(client,playerId,attemptId,true\)/);
  assert.match(game,/level_progress\(player_id,level_id,completed_attempt_id,best_mistakes\)/);
  assert.match(game,/key:`level:\$\{row.level_id\}`/);
  assert.match(game,/key:`bonus:\$\{attemptId\}`/);
  assert.match(game,/LEFT JOIN puzzle_hint_reveals hr/);
  assert.match(game,/puzzle_letter_requests/);
  assert.match(game,/WHERE c.attempt_id=\$1 AND c.cell_position=\$2/);
  assert.match(eco,/FROM players WHERE id=\$1 FOR UPDATE/);
  assert.ok(!eco.includes('req.body.costCoins'));
});
