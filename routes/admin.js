'use strict';
const express = require('express');
const {randomUUID} = require('node:crypto');
const pool = require('../db');
const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
router.post('/test-players', async (_req, res) => {
  try {
    const id = randomUUID();
    const {rows} = await pool.query('INSERT INTO players (id) VALUES ($1) RETURNING id,coins,lives,hints', [id]);
    res.status(201).json({player: rows[0]});
  } catch (err) {
    console.error('Create test player failed:', err.message);
    res.status(500).json({error:'INTERNAL_ERROR'});
  }
});
router.get('/players/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({error:'INVALID_PLAYER_ID'});
  try {
    const {rows} = await pool.query('SELECT id,coins,lives,hints,created_at FROM players WHERE id=$1',[req.params.id]);
    if (!rows.length) return res.status(404).json({error:'PLAYER_NOT_FOUND'});
    res.json({player:rows[0]});
  } catch(err) {console.error(err.message);res.status(500).json({error:'INTERNAL_ERROR'});}
});
// Grants additive coins, not setting a balance; requestId makes retries safe.
router.post('/players/:id/grant-coins', async (req, res) => {
  const {id} = req.params;
  const {amount, reason, requestId} = req.body || {};
  if (!UUID.test(id) || !Number.isInteger(amount) || amount < 1 || amount > 10000 ||
      typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 150 ||
      typeof requestId !== 'string' || !UUID.test(requestId)) {
    return res.status(400).json({error:'INVALID_GRANT_REQUEST'});
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const player = await client.query('SELECT coins FROM players WHERE id=$1 FOR UPDATE', [id]);
    if (!player.rowCount) {await client.query('ROLLBACK');return res.status(404).json({error:'PLAYER_NOT_FOUND'});}
    const existing = await client.query('SELECT player_id,amount,reason FROM admin_grants WHERE request_id=$1',[requestId]);
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      const prev=existing.rows[0];
      if(prev.player_id!==id || prev.amount!==amount || prev.reason!==reason.trim()) {
        return res.status(409).json({error:'REQUEST_ID_CONFLICT'});
      }
      return res.json({applied:false, coins:player.rows[0].coins});
    }
    if (player.rows[0].coins + amount > 1000000) {
      await client.query('ROLLBACK');
      return res.status(409).json({error:'COIN_CAP_EXCEEDED'});
    }
    // Unique request ID prevents double grants if two requests race.
    const grant = await client.query(
      'INSERT INTO admin_grants (request_id,player_id,amount,reason) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING request_id',
      [requestId,id,amount,reason.trim()]
    );
    if (!grant.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({error:'RETRY_REQUEST'});
    }
    const update=await client.query('UPDATE players SET coins=coins+$1 WHERE id=$2 RETURNING coins',[amount,id]);
    await client.query('COMMIT');
    return res.json({applied:true,coins:update.rows[0].coins});
  } catch(err) {
    try {await client.query('ROLLBACK');} catch(_err) {}
    console.error('Admin grant failed:',err.message);
    return res.status(500).json({error:'INTERNAL_ERROR'});
  } finally {client.release();}
});
module.exports = router;
