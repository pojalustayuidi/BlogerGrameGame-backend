'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const migration=fs.readFileSync(path.join(__dirname,'..','db','migrations','001_game_foundation.sql'),'utf8');
const seed=fs.readFileSync(path.join(__dirname,'..','scripts','db-seed.js'),'utf8');
test('migration defines core cryptogram and Case 404 tables',()=>{
  for(const name of ['categories','creators','media_sources','quotes','levels','puzzle_attempts','puzzle_cells','puzzle_notes','level_progress','bonus_answers','cases','case_steps','case_progress']) {
    assert.match(migration,new RegExp(`CREATE TABLE ${name}\\s*\\(`));
  }
});
test('cells are stored per position rather than per cipher number',()=>{
  assert.match(migration,/PRIMARY KEY \(attempt_id,cell_position\)/);
  assert.match(migration,/cipher_number SMALLINT NOT NULL/);
  assert.doesNotMatch(migration,/UNIQUE\s*\(attempt_id,cipher_number\)/);
});
test('unfinished attempts keep their stable cipher map and individual notes',()=>{
  assert.match(migration,/cipher_map JSONB NOT NULL/);
  assert.match(migration,/CREATE TABLE puzzle_notes/);
  assert.match(migration,/WHERE status='in_progress'/);
});
test('encrypted clues and cell numbering cannot change after creation',()=>{
  assert.match(migration,/CREATE TRIGGER trg_protect_puzzle_cell_structure/);
  assert.match(migration,/NEW.given_letter IS DISTINCT FROM OLD.given_letter/);
});
test('verified media belongs to the same creator as the quoted author',()=>{
  assert.match(migration,/FOREIGN KEY \(source_id,creator_id\) REFERENCES media_sources\(id,creator_id\)/);
  assert.match(migration,/UNIQUE \(id,creator_id\)/);
});
test('source links and rights are tracked, and unpublished quotes are allowed',()=>{
  assert.match(migration,/rights_status TEXT NOT NULL DEFAULT 'unknown'/);
  assert.match(migration,/status TEXT NOT NULL DEFAULT 'draft'/);
});
test('seed inserts three thematic categories and no made-up quotes',()=>{
  for(const slug of ['streamers','bloggers','tiktokers'])assert.ok(seed.includes(`'${slug}'`));
  assert.doesNotMatch(seed,/INSERT INTO quotes/);
});
