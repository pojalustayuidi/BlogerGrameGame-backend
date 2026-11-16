'use strict';
const {timingSafeEqual} = require('node:crypto');
function compareKeys(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
function requireAdmin(expected) {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!compareKeys(expected, req.get('X-Admin-Key'))) {
      return res.status(401).json({error:'UNAUTHORIZED'});
    }
    next();
  };
}
module.exports = {compareKeys, requireAdmin};
