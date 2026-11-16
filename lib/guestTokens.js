'use strict';
const {randomBytes, createHash} = require('node:crypto');
// 256-bit opaque credentials, URL-safe with 43 characters. Never place in a URL.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
function newToken() { return randomBytes(32).toString('base64url'); }
function isToken(token) { return typeof token === 'string' && TOKEN_RE.test(token); }
function tokenHash(token) {
  if (!isToken(token)) throw new TypeError('Invalid opaque session token');
  return createHash('sha256').update(token, 'ascii').digest('hex');
}
function parseBearer(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header);
  return match ? match[1] : null;
}
module.exports = {newToken, isToken, tokenHash, parseBearer};
