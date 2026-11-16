'use strict';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
function requireLocalConfiguration(env) {
  if (env.APP_ENV !== 'local' || env.NODE_ENV === 'production') {
    throw new Error('This branch only supports APP_ENV=local, NODE_ENV!=production');
  }
  if (!LOOPBACK.has(env.HOST) || !LOOPBACK.has(env.PGHOST)) {
    throw new Error('HOST and PGHOST must be localhost loopback addresses');
  }
  const port = Number(env.PORT);
  const pgport = Number(env.PGPORT);
  if (![port, pgport].every(n => Number.isInteger(n) && n >= 1 && n <= 65535)) {
    throw new Error('PORT and PGPORT must be valid TCP port numbers');
  }
  for (const key of ['PGUSER', 'PGPASSWORD', 'PGDATABASE']) {
    if (!env[key] || !String(env[key]).trim()) throw new Error(`${key} is missing`);
  }
  const key = env.ADMIN_API_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('ADMIN_API_KEY must be a randomly generated 64-character hex secret');
  }
  return Object.freeze({host: env.HOST, port, pgHost: env.PGHOST, pgPort: pgport,
    pgUser: env.PGUSER, pgPassword: env.PGPASSWORD, pgDatabase: env.PGDATABASE,
    adminKey: key});
}
module.exports = {requireLocalConfiguration};
