'use strict';
// Idempotent categories only. No fictional streamer quotes are published.
const pool = require('../db');
const categories = [
  ['streamers','Стримеры','Известные моменты со стримов',1],
  ['bloggers','Блогеры','Цитаты и моменты из видеоблогов',2],
  ['tiktokers','Тиктокеры','Цитаты и моменты из коротких видео',3]
];
async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [slug,title,description,sort] of categories) {
      await client.query(`INSERT INTO categories(slug,title,description,sort_order)
        VALUES($1,$2,$3,$4) ON CONFLICT(slug) DO NOTHING`,[slug,title,description,sort]);
    }
    await client.query('COMMIT');
    const {rows} = await client.query('SELECT slug,title,sort_order FROM categories ORDER BY sort_order');
    console.log('Categories:', JSON.stringify(rows));
    console.log('No quotes or videos were invented or published.');
  } catch (err) {
    try {await client.query('ROLLBACK');} catch (_) {}
    throw err;
  } finally {client.release();}
}
seed().catch(err=>{console.error(`DB seed failed: ${err.message}`);process.exitCode=1;})
 .finally(()=>pool.end());
