'use strict';
// Stage 03: LOCAL-ONLY guest authentication. Unsafe legacy endpoints stay offline.
const express = require('express');
const {config} = require('./lib/runtime');
const pool = require('./db');
const {requireAdmin} = require('./lib/adminAuth');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const app = express();
app.disable('x-powered-by');
app.disable('trust proxy');
app.use(express.json({limit:'32kb'}));
app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
app.get('/health', async (_req,res)=>{
  try {await pool.query('SELECT 1'); res.json({status:'ok',environment:'local',stage:3});}
  catch(err){console.error('Health DB failure:',err.message);res.status(503).json({status:'database_unavailable'});}
});
app.use('/api/v1/admin', requireAdmin(config.adminKey), adminRoutes);
app.use('/api/v1/auth',authRoutes);
// Game/economy endpoints remain unavailable until owner-authorized services exist.
for (const path of ['/player','/shop','/redeem','/progress','/levels','/admin']) {
  app.use(path, (_req,res)=>res.status(503).json({error:'LEGACY_API_DISABLED',message:'Use protected API after migration'}));
}
app.use('/api/v1',(_req,res)=>res.status(404).json({error:'NOT_IMPLEMENTED_YET'}));
app.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
app.use((err,_req,res,_next)=>{
  console.error('Request error:',err.message);
  res.status(err.status||500).json({error:err.status===400?'INVALID_JSON':'INTERNAL_ERROR'});
});
const server=app.listen(config.port,config.host,()=>{
  console.log(`Local backend stage 03 listening at http://${config.host}:${config.port}`);
});
function shutdown(){server.close(()=>pool.end().finally(()=>process.exit(0)));}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
module.exports = app;
