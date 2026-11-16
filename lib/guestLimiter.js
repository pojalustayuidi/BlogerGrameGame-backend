'use strict';
// LOCAL-ONLY temporary rate limit: 10 new guests per minute per peer address.
// Production needs a shared limiter at the public gateway and additional abuse controls.
function createGuestLimiter({max=10, windowMs=60_000, now=Date.now}={}) {
  const entries = new Map();
  return (req, res, next) => {
    const ip = req.socket?.remoteAddress || 'unknown';
    const current = now();
    let row = entries.get(ip);
    if (!row || current - row.startedAt >= windowMs) {
      row = {startedAt:current,count:0};
      entries.set(ip,row);
    }
    // Limit retained entries even if an unusual dev environment supplies many IPs.
    if (entries.size > 1024) {
      for (const [key, entry] of entries) {
        if (current - entry.startedAt >= windowMs) entries.delete(key);
      }
      if (entries.size > 1024) entries.clear();
    }
    if (row.count >= max) {
      res.set('Retry-After',String(Math.max(1,Math.ceil((windowMs-(current-row.startedAt))/1000))));
      return res.status(429).json({error:'GUEST_RATE_LIMITED'});
    }
    row.count++;
    next();
  };
}
module.exports = {createGuestLimiter};
