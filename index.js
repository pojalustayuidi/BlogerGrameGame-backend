'use strict';
// Stage 04: playable cryptogram API. Still LOCAL-ONLY until security/release review.
const express = require('express');
const {config} = require('./lib/runtime');
const pool = require('./db');
const {requireAdmin} = require('./lib/adminAuth');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const app = express();
app.disable('x-powered-by');
app.disable('trust proxy');
app.use(express.json({limit:'32kb'}));
app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
app.get('/health', async (_req,res)=>{
  try {await pool.query('SELECT 1'); res.json({status:'ok',environment:'local',stage:4});}
  catch(err){console.error('Health DB failure:',err.message);res.status(503).json({status:'database_unavailable'});}
});
app.use('/api/v1/admin', requireAdmin(config.adminKey), adminRoutes);
app.use('/api/v1/auth',authRoutes);
app.use('/api/v1/game',gameRoutes);
// Old endpoints MUST stay disabled; only server-owned /api/v1/game is enabled.
for (const path of ['/player','/shop','/redeem','/progress','/levels','/admin']) {
  app.use(path, (_req,res)=>res.status(503).json({error:'LEGACY_API_DISABLED'}));
}
app.use('/api/v1',(_req,res)=>res.status(404).json({error:'NOT_IMPLEMENTED_YET'}));
app.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
app.use((err,_req,res,_next)=>{
  if(err.status>=400&&err.status<500&&err.code){
    if(err.status===429)res.set('Retry-After','4');
    return res.status(err.status).json({error:err.code});
  }
  console.error('Request error:',err.message);
  if(err.status===400||err.status===413)return res.status(err.status).json({error:err.status===400?'INVALID_JSON':'REQUEST_TOO_LARGE'});
  res.status(500).json({error:'INTERNAL_ERROR'});
});
const server=app.listen(config.port,config.host,()=>{
  console.log(`Local backend stage 04 listening at http://${config.host}:${config.port}`);
});
function shutdown(){server.close(()=>pool.end().finally(()=>process.exit(0)));}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
module.exports = app;
