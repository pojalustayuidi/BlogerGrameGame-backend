'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {makeEconomyService,applyEvent}=require('../services/economyService');
function fakeDatabase({coins=30,hints=2,lives=5}={}){
  const playerId=randomUUID();
  const person={coins,hints,lives,life_regen_at:new Date('2026-11-16T14:00:00Z')};
  const ledger=new Map();
  const client={release(){},async query(sql,args=[]){
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[],rowCount:0};
    if(sql.includes('FROM players WHERE id=$1 FOR UPDATE')){
      return {rows:[{id:playerId,...person,server_now:new Date('2026-11-16T14:00:00Z')}],rowCount:1};
    }
    if(sql.includes('SELECT event_type,details FROM economy_ledger')){
      const entry=ledger.get(args[1]);return {rows:entry?[entry]:[],rowCount:entry?1:0};
    }
    if(sql.includes('UPDATE players SET lives=$2,life_regen_at=$3')){
      person.lives=args[1];person.life_regen_at=args[2];return {rows:[],rowCount:1};
    }
    if(sql.includes('UPDATE players SET coins=$2,hints=$3,lives=$4,life_regen_at=$5')){
      person.coins=args[1];person.hints=args[2];person.lives=args[3];person.life_regen_at=args[4];
      return {rows:[],rowCount:1};
    }
    if(sql.includes('INSERT INTO economy_ledger')){
      ledger.set(args[1],{event_type:args[2],details:JSON.parse(args[6])});
      return {rows:[],rowCount:1};
    }
    throw new Error('Unexpected SQL: '+sql);
  }};
  return {playerId,person,ledger,client,pool:{connect:async()=>client}};
}
test('Shop rejects insufficient coins; retry never charges twice',async()=>{
  const db=fakeDatabase();const s=makeEconomyService(db.pool);const id=randomUUID();
  await assert.rejects(s.purchase(db.playerId,'hint_1',id),e=>e.code==='NOT_ENOUGH_COINS');
  assert.equal(db.person.coins,30);assert.equal(db.ledger.size,0);
  db.person.coins=230;
  const first=await s.purchase(db.playerId,'hint_1',id);
  assert.equal(first.applied,true);assert.equal(db.person.coins,185);assert.equal(db.person.hints,3);
  const repeated=await s.purchase(db.playerId,'hint_1',id);
  assert.equal(repeated.applied,false);assert.equal(db.person.coins,185);
  assert.equal(db.ledger.size,1);
  await assert.rejects(s.purchase(db.playerId,'life_1',id),e=>e.code==='REQUEST_ID_CONFLICT');
});
test('Shop cannot overfill lives/hints and cannot alter prices through client input',async()=>{
  const db=fakeDatabase({coins:400,hints:20,lives:5});const s=makeEconomyService(db.pool);
  await assert.rejects(s.purchase(db.playerId,'hint_1',randomUUID()),e=>e.code==='HINTS_CAP_EXCEEDED');
  await assert.rejects(s.purchase(db.playerId,'life_1',randomUUID()),e=>e.code==='LIVES_CAP_EXCEEDED');
  await assert.rejects(s.purchase(db.playerId,'made_up',randomUUID()),e=>e.code==='INVALID_PURCHASE');
  assert.equal(db.person.coins,400);assert.equal(db.ledger.size,0);
});
test('Reward event is keyed to completed level and caps coins at one million',async()=>{
  const db=fakeDatabase({coins:999990});const levelId=randomUUID();
  const reward={key:`level:${levelId}`,type:'level_reward',coins:40};
  const first=await applyEvent(db.client,db.playerId,reward);
  assert.equal(first.applied,true);assert.equal(first.coinsDelta,10);
  assert.equal(db.person.coins,1_000_000);
  const second=await applyEvent(db.client,db.playerId,reward);
  assert.equal(second.applied,false);assert.equal(db.ledger.size,1);
});
