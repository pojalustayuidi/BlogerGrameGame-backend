'use strict';
const express=require('express');
const {isToken,parseBearer}=require('../lib/guestTokens');
const {createGuestLimiter}=require('../lib/guestLimiter');
const {makeGuestAuthService}=require('../services/guestAuthService');
const pool=require('../db');
const router=express.Router();
const service=makeGuestAuthService(pool);
router.use((_req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('Pragma','no-cache');
  next();
});

router.post('/guest',createGuestLimiter(),async (req,res)=>{
  // Guest IDs, balances and tokens must NEVER be client-supplied.
  if (req.body!==undefined && (req.body===null || Array.isArray(req.body) ||
      typeof req.body!=='object' || Object.keys(req.body).length!==0)) {
    return res.status(400).json({error:'INVALID_GUEST_REQUEST'});
  }
  const result=await service.createGuest();
  res.status(201).json(result);
});

router.get('/me',async (req,res)=>{
  const token=parseBearer(req.get('Authorization'));
  if (!token) return res.status(401).json({error:'UNAUTHORIZED'});
  const player=await service.getMe(token);
  if (!player) return res.status(401).json({error:'UNAUTHORIZED'});
  return res.json({player});
});

router.post('/refresh',async (req,res)=>{
  if (!req.body || typeof req.body!=='object' || Array.isArray(req.body) ||
      Object.keys(req.body).length!==1 || !isToken(req.body.refreshToken)) {
    return res.status(400).json({error:'INVALID_REFRESH_REQUEST'});
  }
  const updated=await service.refresh(req.body.refreshToken);
  if (!updated) return res.status(401).json({error:'UNAUTHORIZED'});
  return res.json(updated);
});

router.post('/logout',async (req,res)=>{
  const token=parseBearer(req.get('Authorization'));
  if (!token) return res.status(401).json({error:'UNAUTHORIZED'});
  const ok=await service.logout(token);
  if (!ok) return res.status(401).json({error:'UNAUTHORIZED'});
  return res.status(204).end();
});
module.exports=router;
