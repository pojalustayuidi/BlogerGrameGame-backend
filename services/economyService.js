'use strict';
const {RULES,SHOP,regenLives}=require('../lib/economyRules');
const BAD=(status,code)=>Object.assign(new Error(code),{status,code});

function shapeWallet(row,nextLifeAt){
  return {coins:Number(row.coins),lives:Number(row.lives),hints:Number(row.hints),
    maxLives:RULES.maxLives,maxHints:RULES.maxHints,lifeRegenMinutes:RULES.regenMinutes,
    nextLifeAt:nextLifeAt?nextLifeAt.toISOString():null};
}
// Always lock players when changing balances. Call inside an existing transaction.
async function syncWallet(client,playerId){
  const r=await client.query(`SELECT id,coins,lives,hints,life_regen_at,NOW() AS server_now
    FROM players WHERE id=$1 FOR UPDATE`,[playerId]);
  if(!r.rowCount)throw BAD(401,'UNAUTHORIZED');
  const p=r.rows[0];
  const calc=regenLives(Number(p.lives),p.life_regen_at,p.server_now);
  if(calc.lives!==Number(p.lives)||calc.regenAt.getTime()!==new Date(p.life_regen_at).getTime()){
    await client.query('UPDATE players SET lives=$2,life_regen_at=$3 WHERE id=$1',[playerId,calc.lives,calc.regenAt]);
  }
  return {coins:Number(p.coins),hints:Number(p.hints),lives:calc.lives,
    regenAt:calc.regenAt,now:new Date(p.server_now),nextLifeAt:calc.nextLifeAt};
}
function walletDTO(w){return shapeWallet(w,w.nextLifeAt);}
async function applyEvent(client,playerId,{key,type,coins=0,hints=0,lives=0,details={}}){
  const w=await syncWallet(client,playerId);
  const existing=await client.query('SELECT event_type,details FROM economy_ledger WHERE player_id=$1 AND event_key=$2',[playerId,key]);
  if(existing.rowCount)return {applied:false,wallet:walletDTO(w),previous:existing.rows[0]};
  if(w.coins+coins<0)throw BAD(409,'NOT_ENOUGH_COINS');
  if(w.hints+hints<0)throw BAD(409,'NOT_ENOUGH_HINTS');
  if(w.lives+lives<0)throw BAD(409,'NOT_ENOUGH_LIVES');
  if(w.hints+hints>RULES.maxHints)throw BAD(409,'HINTS_CAP_EXCEEDED');
  if(w.lives+lives>RULES.maxLives)throw BAD(409,'LIVES_CAP_EXCEEDED');
  const nextCoins=Math.min(RULES.maxCoins,w.coins+coins);
  const actualCoins=nextCoins-w.coins;
  const nextLives=w.lives+lives;
  const regenAt=nextLives===RULES.maxLives||(w.lives===RULES.maxLives&&lives<0)?w.now:w.regenAt;
  const nextLifeAt=nextLives===RULES.maxLives?null:new Date(regenAt.getTime()+RULES.regenMinutes*60*1000);
  await client.query(`UPDATE players SET coins=$2,hints=$3,lives=$4,life_regen_at=$5 WHERE id=$1`,
    [playerId,nextCoins,w.hints+hints,nextLives,regenAt]);
  await client.query(`INSERT INTO economy_ledger(player_id,event_key,event_type,coins_delta,hints_delta,lives_delta,details)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[playerId,key,type,actualCoins,hints,lives,JSON.stringify(details)]);
  return {applied:true,coinsDelta:actualCoins,wallet:walletDTO({...w,coins:nextCoins,hints:w.hints+hints,lives:nextLives,nextLifeAt})};
}
function makeEconomyService(pool){
  async function getWallet(playerId){
    const c=await pool.connect();let tx=false;
    try{await c.query('BEGIN');tx=true;const w=await syncWallet(c,playerId);
      await c.query('COMMIT');tx=false;return walletDTO(w);
    }catch(e){if(tx)await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }
  function offers(){return Object.values(SHOP);}
  async function purchase(playerId,sku,requestId){
    if(typeof sku!=='string'||!Object.hasOwn(SHOP,sku)||typeof requestId!=='string'||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw BAD(400,'INVALID_PURCHASE');
    const offer=SHOP[sku];const c=await pool.connect();let tx=false;
    try{
      await c.query('BEGIN');tx=true;
      const delta={key:`shop:${requestId.toLowerCase()}`,type:'shop_purchase',coins:-offer.costCoins,
        hints:offer.kind==='hints'?offer.quantity:0,
        lives:offer.kind==='lives'?offer.quantity:0,details:{sku}};
      const result=await applyEvent(c,playerId,delta);
      if(!result.applied&&result.previous.details.sku!==sku)throw BAD(409,'REQUEST_ID_CONFLICT');
      await c.query('COMMIT');tx=false;
      return {applied:result.applied,sku,wallet:result.wallet};
    }catch(e){if(tx)await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }
  async function history(playerId){
    const {rows}=await pool.query(`SELECT event_type,coins_delta,hints_delta,lives_delta,details,created_at
      FROM economy_ledger WHERE player_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30`,[playerId]);
    return rows.map(x=>({type:x.event_type,coinsDelta:x.coins_delta,hintsDelta:x.hints_delta,
      livesDelta:x.lives_delta,details:x.details,createdAt:x.created_at}));
  }
  return {getWallet,offers,purchase,history};
}
module.exports={makeEconomyService,applyEvent,syncWallet,walletDTO,BAD};
