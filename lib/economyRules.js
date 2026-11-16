'use strict';
// Versioned server-owned playtest balance; never accept prices or deltas from clients.
const RULES=Object.freeze({
  maxCoins:1_000_000,maxHints:20,maxLives:5,regenMinutes:30,
  wrongLettersPerLife:3,
  bonusCorrect:10,flawless:5,
  rewards:Object.freeze({easy:20,normal:30,hard:40,expert:55})
});
const SHOP=Object.freeze({
  hint_1:Object.freeze({sku:'hint_1',kind:'hints',quantity:1,costCoins:45}),
  hint_3:Object.freeze({sku:'hint_3',kind:'hints',quantity:3,costCoins:120}),
  life_1:Object.freeze({sku:'life_1',kind:'lives',quantity:1,costCoins:50}),
  life_3:Object.freeze({sku:'life_3',kind:'lives',quantity:3,costCoins:120})
});
function costsLifeOnWrongLetter(mistakesAfter){
  return Number.isInteger(mistakesAfter)&&mistakesAfter>0 && mistakesAfter%RULES.wrongLettersPerLife===0;
}
function triesRemaining(mistakes){
  if(!Number.isInteger(mistakes)||mistakes<0)throw new Error('INVALID_MISTAKES');
  return RULES.wrongLettersPerLife-(mistakes%RULES.wrongLettersPerLife);
}
function quoteReward(difficulty){
  return RULES.rewards[difficulty]??RULES.rewards.normal;
}
function regenLives(lives,regenAt,now){
  const current=new Date(now).getTime();
  const anchor=new Date(regenAt).getTime();
  if(!Number.isInteger(lives)||lives<0||lives>RULES.maxLives||!Number.isFinite(current)||!Number.isFinite(anchor))throw new Error('INVALID_LIFE_STATE');
  if(lives===RULES.maxLives)return {lives,regenAt:new Date(anchor),nextLifeAt:null};
  const interval=RULES.regenMinutes*60*1000;
  const elapsed=Math.max(0,current-anchor);
  const restored=Math.min(RULES.maxLives-lives,Math.floor(elapsed/interval));
  const updated=lives+restored;
  const nextAnchor=updated===RULES.maxLives?current:anchor+restored*interval;
  return {lives:updated,regenAt:new Date(nextAnchor),nextLifeAt:updated===RULES.maxLives?null:new Date(nextAnchor+interval)};
}
module.exports={RULES,SHOP,costsLifeOnWrongLetter,triesRemaining,quoteReward,regenLives};
