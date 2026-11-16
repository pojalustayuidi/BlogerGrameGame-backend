'use strict';
// No embedded credentials, no remote database fallback.
const {Pool} = require('pg');
const {config} = require('./lib/runtime');
module.exports = new Pool({host:config.pgHost, port:config.pgPort,
  user:config.pgUser, password:config.pgPassword, database:config.pgDatabase,
  ssl:false, max:5, connectionTimeoutMillis:3000, idleTimeoutMillis:10000});
