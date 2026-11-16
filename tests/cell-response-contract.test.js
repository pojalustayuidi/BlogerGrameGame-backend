'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const route=fs.readFileSync(path.join(__dirname,'..','routes','game.js'),'utf8');

test('per-letter endpoint returns flat result matching game and economy smoke contracts',()=>{
  assert.match(route,/res\.json\(await game\.editCell\(req\.gamePlayerId,req\.params\.id,Number\(req\.params\.position\),req\.body\.letter,req\.body\.requestId\)\);/);
  assert.doesNotMatch(route,/res\.json\(\{cell:await game\.editCell/);
});

test('other game endpoints preserve their distinct envelopes',()=>{
  assert.match(route,/res\.json\(\{attempt:await game\.getAttempt/);
  assert.match(route,/res\.json\(\{wallet:await economy\.getWallet/);
});
