'use strict';
const pool = require('../db');
async function status(){
  const client=await pool.connect();
  try {
    const applied=await client.query('SELECT filename,applied_at FROM schema_migrations ORDER BY filename');
    console.log('Applied migrations:',applied.rows);
    for (const table of ['players','guest_sessions','categories','creators','media_sources','quotes','levels','puzzle_attempts','puzzle_cells','puzzle_notes','cases','case_steps','level_progress','bonus_answers']) {
      // Table names are hardcoded (never user input).
      const {rows}=await client.query(`SELECT COUNT(*)::integer AS total FROM ${table}`);
      console.log(`${table}: ${rows[0].total}`);
    }
    const cats=await client.query('SELECT slug,title FROM categories ORDER BY sort_order');
    console.log('Categories:',cats.rows);
  } finally {client.release();}
}
status().catch(e=>{console.error(`DB status failed: ${e.message}`);process.exitCode=1;})
 .finally(()=>pool.end());
