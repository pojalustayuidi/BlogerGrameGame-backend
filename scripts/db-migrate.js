'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const pool = require('../db'); // requires safe local configuration from stage 01

const folder = path.join(__dirname, '..', 'db', 'migrations');
const migrations = fs.readdirSync(folder).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();

async function migrate() {
  if (!migrations.length) throw new Error('No migrations found');
  const client = await pool.connect();
  try {
    for (const filename of migrations) {
      const source = fs.readFileSync(path.join(folder, filename), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      await client.query('BEGIN');
      try {
        // Serialize concurrent migrations before the history table is created.
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [404, 2]);
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
          filename TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        const {rows} = await client.query('SELECT checksum FROM schema_migrations WHERE filename=$1', [filename]);
        if (rows.length) {
          if (rows[0].checksum !== checksum) {
            throw new Error(`Migration ${filename} has changed since applying. Do not edit applied migrations.`);
          }
          await client.query('COMMIT');
          console.log(`[skip] ${filename}`);
          continue;
        }
        await client.query(source);
        await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [filename,checksum]);
        await client.query('COMMIT');
        console.log(`[applied] ${filename}`);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw error;
      }
    }
    console.log(`Database ready. ${migrations.length} migration file(s) checked.`);
  } finally {
    client.release();
  }
}

migrate().catch(err => { console.error(`Database migration failed: ${err.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
