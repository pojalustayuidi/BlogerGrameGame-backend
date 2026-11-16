'use strict';
const express=require('express');
const {parseBearer}=require('../lib/guestTokens');
const pool=require('../db');
const {makeGameService}=require('../services/gameService');
const {makeEconomyService}=require('../services/economyService');
const router=express.Router();
// Stage 01-04 are localhost-only; draft preview is explicitly opt-in for local playtests.
const allowDraftPreview=process.env.APP_ENV==='local' && process.env.LOCAL_DRAFT_PREVIEW==='1';
const game=makeGameService(pool,{allowDraftPreview});
const economy=makeEconomyService(pool);
router.use(async(req,res,next)=>{
  const access=parseBearer(req.get('Authorization'));
  if(!access)return res.status(401).json({error:'UNAUTHORIZED'});
  try{
    const id=await game.authenticate(access);
    if(!id)return res.status(401).json({error:'UNAUTHORIZED'});
    req.gamePlayerId=id;
    next();
  }catch(err){next(err);}
});
function safe(handler){return (req,res,next)=>Promise.resolve(handler(req,res)).catch(next);}
function bodyShape(body,names){return body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===names.length&&names.every(k=>Object.hasOwn(body,k));}
router.get('/categories',safe(async(req,res)=>res.json({categories:await game.categories()})));
router.get('/wallet',safe(async(req,res)=>res.json({wallet:await economy.getWallet(req.gamePlayerId)})));
router.get('/wallet/history',safe(async(req,res)=>res.json({events:await economy.history(req.gamePlayerId)})));
router.get('/shop',safe(async(req,res)=>res.json({offers:economy.offers()})));
router.post('/shop/purchases',safe(async(req,res)=>{
  if(!bodyShape(req.body,['sku','requestId']))return res.status(400).json({error:'INVALID_PURCHASE'});
  res.json(await economy.purchase(req.gamePlayerId,req.body.sku,req.body.requestId));
}));
router.get('/levels',safe(async(req,res)=>{
  if(Object.keys(req.query).some(k=>k!=='category'))return res.status(400).json({error:'INVALID_QUERY'});
  const levels=await game.listLevels(req.gamePlayerId,req.query.category);
  res.json({levels,draftPreview:allowDraftPreview});
}));
router.post('/levels/:id/attempts',safe(async(req,res)=>{
  if(req.body!==undefined&&!bodyShape(req.body,[]))return res.status(400).json({error:'INVALID_START_REQUEST'});
  const result=await game.createAttempt(req.gamePlayerId,req.params.id);
  res.status(result.created?201:200).json(result);
}));
router.get('/attempts/:id',safe(async(req,res)=>res.json({attempt:await game.getAttempt(req.gamePlayerId,req.params.id)})));
router.patch('/attempts/:id/cells/:position',safe(async(req,res)=>{
  if(!bodyShape(req.body,['letter','requestId']))return res.status(400).json({error:'INVALID_CELL_REQUEST'});
  if(!/^(0|[1-9]\d{0,2})$/.test(req.params.position))return res.status(400).json({error:'INVALID_CELL'});
  res.json(await game.editCell(req.gamePlayerId,req.params.id,Number(req.params.position),req.body.letter,req.body.requestId));
}));
router.put('/attempts/:id/notes/:number',safe(async(req,res)=>{
  if(!bodyShape(req.body,['letter','comment']))return res.status(400).json({error:'INVALID_NOTE_REQUEST'});
  if(!/^[1-9]\d{0,1}$/.test(req.params.number))return res.status(400).json({error:'INVALID_NOTE'});
  res.json({note:await game.editNote(req.gamePlayerId,req.params.id,Number(req.params.number),req.body.letter,req.body.comment)});
}));
// Whole-phrase checks are obsolete: every keypress is validated server-side.
router.post('/attempts/:id/check',(_req,res)=>res.status(410).json({error:'LETTER_VALIDATION_ONLY'}));
router.post('/attempts/:id/hints/reveal',safe(async(req,res)=>{
  if(!bodyShape(req.body,['position']))return res.status(400).json({error:'INVALID_HINT_TARGET'});
  res.json(await game.revealHint(req.gamePlayerId,req.params.id,req.body.position));
}));
router.post('/attempts/:id/bonus',safe(async(req,res)=>{
  if(!bodyShape(req.body,['guessedCreatorId']))return res.status(400).json({error:'INVALID_BONUS_REQUEST'});
  res.json(await game.answerBonus(req.gamePlayerId,req.params.id,req.body.guessedCreatorId));
}));
module.exports=router;
