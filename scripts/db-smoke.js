'use strict';
// Transactional integration smoke test. Always rolls back test rows and preserves real data.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const pool=require('../db');
async function smoke(){
  const client=await pool.connect();
  let tx=false;
  try {
    await client.query('BEGIN'); tx=true;
    const playerId=randomUUID();
    await client.query('INSERT INTO players(id) VALUES($1)',[playerId]);
    const category=await client.query('SELECT slug FROM categories WHERE slug=$1',['streamers']);
    assert.equal(category.rowCount,1,'streamers category missing; run npm run db:seed');
    const creator=await client.query("INSERT INTO creators(display_name) VALUES('DEMO TEST CREATOR - NOT REAL') RETURNING id");
    const creatorId=creator.rows[0].id;
    await client.query('INSERT INTO creator_categories(creator_id,category_slug) VALUES($1,$2)',[creatorId,'streamers']);
    const quote=await client.query("INSERT INTO quotes(creator_id,quote_text,status) VALUES($1,'ТЕСТ ТЕСТ','draft') RETURNING id",[creatorId]);
    const quoteId=quote.rows[0].id;
    const nextRow=await client.query('SELECT COALESCE(MAX(level_number),0)+1 AS next FROM levels WHERE category_slug=$1',['streamers']);
    const testLevelNumber=Math.max(90000,Number(nextRow.rows[0].next));
    assert.ok(testLevelNumber<=100000,'No free smoke-test level number');
    const level=await client.query('INSERT INTO levels(category_slug,quote_id,level_number) VALUES($1,$2,$3) RETURNING id',['streamers',quoteId,testLevelNumber]);
    const levelId=level.rows[0].id;
    const cipherMap={Т:8,Е:12,С:3};
    const attempt=await client.query('INSERT INTO puzzle_attempts(player_id,level_id,cipher_map) VALUES($1,$2,$3::jsonb) RETURNING id',[playerId,levelId,JSON.stringify(cipherMap)]);
    const attemptId=attempt.rows[0].id;
    // Two cells share number 8 (same correct letter), but both start empty.
    await client.query(`INSERT INTO puzzle_cells(attempt_id,cell_position,cipher_number)
      VALUES($1,0,8),($1,3,8)`,[attemptId]);
    await client.query(`UPDATE puzzle_cells SET entered_letter='Т' WHERE attempt_id=$1 AND cell_position=0`,[attemptId]);
    const {rows:cells}=await client.query('SELECT cell_position,entered_letter FROM puzzle_cells WHERE attempt_id=$1 ORDER BY cell_position',[attemptId]);
    assert.equal(cells[0].entered_letter,'Т');
    assert.equal(cells[1].entered_letter,null,'BUG: same cipher number auto-filled another cell');
    // A cipher number is part of the saved puzzle, not editable player input.
    await client.query('SAVEPOINT validate_number');
    let numberProtected=false;
    try {await client.query('UPDATE puzzle_cells SET cipher_number=17 WHERE attempt_id=$1 AND cell_position=0',[attemptId]);}
    catch (e) {numberProtected=e.code==='23514';}
    await client.query('ROLLBACK TO SAVEPOINT validate_number');
    assert.equal(numberProtected,true,'Cipher mapping should be immutable after attempt creation');
    // Scratchpad is separate and never writes to puzzle_cells.
    await client.query(`INSERT INTO puzzle_notes(attempt_id,cipher_number,candidate_letter)
      VALUES($1,8,'Т')`,[attemptId]);
    const {rows:afterNotes}=await client.query('SELECT entered_letter FROM puzzle_cells WHERE attempt_id=$1 AND cell_position=3',[attemptId]);
    assert.equal(afterNotes[0].entered_letter,null);
    // Given cells reject draft edits at the DB level.
    await client.query('SAVEPOINT validate_given');
    await client.query(`INSERT INTO puzzle_cells(attempt_id,cell_position,cipher_number,given_letter)
      VALUES($1,4,12,'Е')`,[attemptId]);
    let blocked=false;
    try {await client.query(`UPDATE puzzle_cells SET entered_letter='О' WHERE attempt_id=$1 AND cell_position=4`,[attemptId]);}
    catch (e) {blocked=e.code==='23514';}
    await client.query('ROLLBACK TO SAVEPOINT validate_given');
    assert.equal(blocked,true,'Given clue must reject manual replacement');
    const caseSlug=`case-404-smoke-${randomUUID().slice(0,8)}`;
    const puzzleCase=await client.query("INSERT INTO cases(slug,title,category_slug) VALUES($1,'Дело 404: тест','streamers') RETURNING id",[caseSlug]);
    await client.query('INSERT INTO case_steps(case_id,step_number,level_id) VALUES($1,1,$2)',[puzzleCase.rows[0].id,levelId]);
    console.log('PASS: categories / creator / quote / level / attempt / case relations');
    console.log('PASS: manual cell entry; matching cipher numbers are NOT auto-filled');
    console.log('PASS: scratchpad notes do NOT modify puzzle cells');
    console.log('PASS: initial clues and puzzle numbering are immutable');
    console.log('PASS: smoke test data will be rolled back');
  } finally {
    if (tx) {try {await client.query('ROLLBACK');}catch(e){console.error('Rollback failed:',e.message);}}
    client.release();
  }
}
smoke().catch(e=>{console.error(`DB smoke test failed: ${e.stack||e.message}`);process.exitCode=1;})
 .finally(()=>pool.end());
