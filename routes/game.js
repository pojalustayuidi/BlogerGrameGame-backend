'use strict';
const express=require('express');
const {parseBearer}=require('../lib/guestTokens');
const pool=require('../db');
const {makeGameService}=require('../services/gameService');
const router=express.Router();
// Stage 01-04 are localhost-only; draft preview is explicitly opt-in for local playtests.
const allowDraftPreview=process.env.APP_ENV==='local' && process.env.LOCAL_DRAFT_PREVIEW==='1';
const game=makeGameService(pool,{allowDraftPreview});
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
  if(!bodyShape(req.body,['letter']))return res.status(400).json({error:'INVALID_CELL_REQUEST'});
  if(!/^(0|[1-9]\d{0,2})$/.test(req.params.position))return res.status(400).json({error:'INVALID_CELL'});
  res.json({cell:await game.editCell(req.gamePlayerId,req.params.id,Number(req.params.position),req.body.letter)});
}));
router.put('/attempts/:id/notes/:number',safe(async(req,res)=>{
  if(!bodyShape(req.body,['letter','comment']))return res.status(400).json({error:'INVALID_NOTE_REQUEST'});
  if(!/^[1-9]\d{0,1}$/.test(req.params.number))return res.status(400).json({error:'INVALID_NOTE'});
  res.json({note:await game.editNote(req.gamePlayerId,req.params.id,Number(req.params.number),req.body.letter,req.body.comment)});
}));
router.post('/attempts/:id/check',safe(async(req,res)=>{
  if(req.body!==undefined&&!bodyShape(req.body,[]))return res.status(400).json({error:'INVALID_CHECK_REQUEST'});
  res.json(await game.check(req.gamePlayerId,req.params.id));
}));
router.post('/attempts/:id/bonus',safe(async(req,res)=>{
  if(!bodyShape(req.body,['guessedCreatorId']))return res.status(400).json({error:'INVALID_BONUS_REQUEST'});
  res.json(await game.answerBonus(req.gamePlayerId,req.params.id,req.body.guessedCreatorId));
}));
module.exports=router;
