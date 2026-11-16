'use strict';
const {randomUUID} = require('node:crypto');
const {newToken, tokenHash} = require('../lib/guestTokens');

const ACCESS_EXPIRES_IN = 15 * 60; // seconds
const REFRESH_EXPIRES_IN = 30 * 24 * 60 * 60;
const PLAYER_FIELDS = 'id, coins, lives, hints, is_guest, created_at';
function publicPlayer(p) {
  return {id:p.id, coins:p.coins, lives:p.lives, hints:p.hints,
    isGuest:p.is_guest, createdAt:p.created_at};
}
function tokenResponse(player, accessToken, refreshToken, session) {
  return {tokenType:'Bearer', accessToken, refreshToken,
    expiresIn:ACCESS_EXPIRES_IN, refreshExpiresIn:REFRESH_EXPIRES_IN,
    accessExpiresAt:session.access_expires_at,
    refreshExpiresAt:session.refresh_expires_at, player:publicPlayer(player)};
}

function makeGuestAuthService(pool) {
  async function createGuest() {
    const accessToken=newToken(), refreshToken=newToken();
    const client=await pool.connect();
    let tx=false;
    try {
      await client.query('BEGIN'); tx=true;
      const id=randomUUID();
      const p=await client.query(`INSERT INTO players(id,is_guest) VALUES($1,TRUE)
        RETURNING ${PLAYER_FIELDS}`, [id]);
      const session=await client.query(`INSERT INTO guest_sessions
        (player_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at)
        VALUES($1,$2,$3,NOW()+INTERVAL '15 minutes',NOW()+INTERVAL '30 days')
        RETURNING access_expires_at,refresh_expires_at`,
        [id,tokenHash(accessToken),tokenHash(refreshToken)]);
      await client.query('COMMIT'); tx=false;
      return tokenResponse(p.rows[0], accessToken, refreshToken, session.rows[0]);
    } catch(e) {
      if (tx) await client.query('ROLLBACK').catch(()=>{});
      throw e;
    } finally {client.release();}
  }

  async function getMe(accessToken) {
    const result=await pool.query(`SELECT p.${PLAYER_FIELDS.replaceAll(', ', ', p.')}
      FROM guest_sessions s JOIN players p ON p.id=s.player_id
      WHERE s.access_token_hash=$1 AND s.revoked_at IS NULL
      AND s.access_expires_at > NOW()`, [tokenHash(accessToken)]);
    return result.rowCount ? publicPlayer(result.rows[0]) : null;
  }

  // Atomic rotation means the previously used refresh/access token becomes invalid.
  // Transaction prevents losing a session if reading the player fails.
  async function refresh(refreshToken) {
    const accessToken=newToken(), nextRefreshToken=newToken();
    const client=await pool.connect();
    let tx=false;
    try {
      await client.query('BEGIN'); tx=true;
      const session=await client.query(`UPDATE guest_sessions SET
        access_token_hash=$2, refresh_token_hash=$3,
        access_expires_at=NOW()+INTERVAL '15 minutes',
        refresh_expires_at=NOW()+INTERVAL '30 days', last_seen_at=NOW()
        WHERE refresh_token_hash=$1 AND revoked_at IS NULL
        AND refresh_expires_at>NOW()
        RETURNING player_id,access_expires_at,refresh_expires_at`,
        [tokenHash(refreshToken),tokenHash(accessToken),tokenHash(nextRefreshToken)]);
      if (!session.rowCount) {
        await client.query('ROLLBACK'); tx=false;
        return null;
      }
      const player=await client.query(`SELECT ${PLAYER_FIELDS} FROM players WHERE id=$1`,[session.rows[0].player_id]);
      if (!player.rowCount) throw new Error('Session refers to missing player');
      await client.query('COMMIT'); tx=false;
      return tokenResponse(player.rows[0],accessToken,nextRefreshToken,session.rows[0]);
    } catch(e) {
      if (tx) await client.query('ROLLBACK').catch(()=>{});
      throw e;
    } finally {client.release();}
  }

  async function logout(accessToken) {
    const result=await pool.query(`UPDATE guest_sessions SET revoked_at=NOW()
      WHERE access_token_hash=$1 AND revoked_at IS NULL
      AND access_expires_at>NOW() RETURNING id`,[tokenHash(accessToken)]);
    return result.rowCount>0;
  }
  return {createGuest, getMe, refresh, logout};
}
module.exports = {makeGuestAuthService, publicPlayer, ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN};
