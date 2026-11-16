'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {RULES,costsLifeOnWrongLetter,triesRemaining,regenLives}=require('../lib/economyRules');
const get=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('Three incorrect individual letters spend a life, attempts then reset',()=>{
  assert.deepEqual(Array.from({length:7},(_,i)=>triesRemaining(i)),[3,2,1,3,2,1,3]);
  assert.deepEqual(Array.from({length:7},(_,i)=>costsLifeOnWrongLetter(i)),[false,false,false,true,false,false,true]);
  assert.equal(RULES.wrongLettersPerLife,3);
});
test('Regen is one life every thirty minutes and caps at five',()=>{
  const p=regenLives(0,'2026-11-16T10:00:00Z','2026-11-16T11:01:00Z');
  assert.equal(p.lives,2);
  assert.equal(p.nextLifeAt.toISOString(),'2026-11-16T11:30:00.000Z');
});
test('Additive migration stores durable letter request response, preserving old SQL',()=>{
  const sql=get('db/migrations/005_letter_attempts.sql');
  assert.match(sql,/CREATE TABLE puzzle_letter_requests/);
  assert.match(sql,/PRIMARY KEY \(attempt_id,request_id\)/);
  assert.match(sql,/FOREIGN KEY \(attempt_id,cell_position\)/);
  assert.match(sql,/wrong_letter/);
});
test('Only the addressed position can be updated, wrong guesses never stored',()=>{
  const js=get('services/gameService.js');
  const guess=js.slice(js.indexOf('async function editCell('),js.indexOf('async function editNote('));
  assert.match(guess,/WHERE attempt_id=\$1 AND cell_position=\$2/);
  assert.match(guess,/if\(letter!==correct\)/);
  assert.match(guess,/if\(w.lives===0\)throw BAD\(409,'NO_LIVES'\)/);
  assert.match(guess,/puzzle_letter_requests/);
  assert.match(guess,/lostLife/);
  assert.ok(!guess.includes('UPDATE puzzle_cells SET entered_letter=$3 WHERE attempt_id=$1 AND cipher_number'));
});
test('Full check cannot be used to bypass per-letter validation',()=>{
  const r=get('routes/game.js');
  assert.match(r,/LETTER_VALIDATION_ONLY/);
  assert.match(r,/\['letter','requestId'\]/);
  assert.match(r,/game\.editCell\(req\.gamePlayerId,req\.params\.id,Number\(req\.params\.position\),req\.body\.letter,req\.body\.requestId\)/);
});
