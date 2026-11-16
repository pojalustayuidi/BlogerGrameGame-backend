'use strict';
const {tokenHash}=require('../lib/guestTokens');
const {splitQuote,cleanLetter,generateCipher,chooseGivens,renderLayout,isSolved,publicLevel}=require('../lib/puzzleText');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BAD=(status,code)=>Object.assign(new Error(code),{status,code});
const CHECK_COOLDOWN_SECONDS=4;
function isId(v){return typeof v==='string'&&UUID.test(v);}
function makeGameService(pool,{allowDraftPreview=false}={}){
  const preview=allowDraftPreview===true;
  const visibility=preview?"(l.is_published AND q.status='published' OR (NOT l.is_published AND q.status='draft'))":"(l.is_published AND q.status='published')";
  async function authenticate(rawToken){
    const r=await pool.query(`SELECT player_id FROM guest_sessions WHERE access_token_hash=$1
      AND revoked_at IS NULL AND access_expires_at>NOW()`,[tokenHash(rawToken)]);
    return r.rowCount?r.rows[0].player_id:null;
  }
  async function categories(){
    const r=await pool.query(`SELECT c.slug,c.title,COUNT(q.id)::int AS levels FROM categories c
      LEFT JOIN levels l ON l.category_slug=c.slug
      LEFT JOIN quotes q ON q.id=l.quote_id AND ${visibility.replace(/l\.is_published/g,'l.is_published').replace(/q\.status/g,'q.status')}
      WHERE c.is_active=TRUE GROUP BY c.slug,c.title,c.sort_order ORDER BY c.sort_order`);
    // Count actual available levels; JOIN above does not filter l if q invisible.
    return r.rows.map(({slug,title,levels})=>({slug,title,levels}));
  }
  async function listLevels(playerId,category){
    if(category!==undefined&&!['streamers','bloggers','tiktokers'].includes(category))throw BAD(400,'INVALID_CATEGORY');
    const r=await pool.query(`SELECT l.id,l.category_slug,l.level_number,q.difficulty,
      char_length(regexp_replace(upper(q.quote_text),'[^А-ЯЁ]','','g'))::int AS letter_count,
      (NOT l.is_published)::boolean AS is_preview,
      (lp.player_id IS NOT NULL) AS completed
      FROM levels l JOIN quotes q ON q.id=l.quote_id
      JOIN categories c ON c.slug=l.category_slug
      LEFT JOIN level_progress lp ON lp.level_id=l.id AND lp.player_id=$1
      WHERE c.is_active=TRUE AND ${visibility} AND ($2::text IS NULL OR l.category_slug=$2)
      ORDER BY c.sort_order,l.level_number LIMIT 250`,[playerId,category||null]);
    return r.rows.map(publicLevel);
  }
  async function loadLevel(client,levelId){
    const r=await client.query(`SELECT l.*,q.quote_text,q.creator_id,q.difficulty,q.status AS quote_status,
      q.source_id,c.is_active
      FROM levels l JOIN quotes q ON q.id=l.quote_id JOIN categories c ON c.slug=l.category_slug
      WHERE l.id=$1 AND ${visibility} AND c.is_active=TRUE`,[levelId]);
    return r.rows[0]||null;
  }
  async function getAttemptRow(client,playerId,attemptId,lock=false){
    const r=await client.query(`SELECT a.id,a.player_id,a.level_id,a.cipher_map,a.status,a.mistakes,
      a.started_at,a.completed_at,a.last_checked_at,q.quote_text,q.creator_id,
      q.source_id,l.category_slug,l.level_number
      FROM puzzle_attempts a JOIN levels l ON l.id=a.level_id
      JOIN quotes q ON q.id=l.quote_id JOIN categories c ON c.slug=l.category_slug
      WHERE a.id=$1 AND a.player_id=$2 AND c.is_active=TRUE AND ${visibility} ${lock?'FOR UPDATE OF a':''}`,[attemptId,playerId]);
    if(!r.rowCount)throw BAD(404,'ATTEMPT_NOT_FOUND');
    return r.rows[0];
  }
  async function attemptPayload(client,row){
    const [cells,notes,bonus]=await Promise.all([
      client.query('SELECT cell_position,cipher_number,given_letter,entered_letter FROM puzzle_cells WHERE attempt_id=$1 ORDER BY cell_position',[row.id]),
      client.query('SELECT cipher_number,candidate_letter,comment FROM puzzle_notes WHERE attempt_id=$1 ORDER BY cipher_number',[row.id]),
      client.query('SELECT result,guessed_creator_id FROM bonus_answers WHERE attempt_id=$1',[row.id])
    ]);
    const response={id:row.id,levelId:row.level_id,category:row.category_slug,levelNumber:row.level_number,
      status:row.status,mistakes:row.mistakes,startedAt:row.started_at,completedAt:row.completed_at,
      layout:renderLayout(row.quote_text,cells.rows),notes:notes.rows.map(x=>({number:x.cipher_number,letter:x.candidate_letter,comment:x.comment})),
      bonusAnswered:bonus.rowCount>0};
    if(row.status==='solved'){
      if(!bonus.rowCount){response.bonusOptions=await bonusChoices(client,row);}
      else response.reveal=await reveal(client,row,bonus.rows[0]);
    }
    return response;
  }
  async function getAttempt(playerId,attemptId){
    if(!isId(attemptId))throw BAD(400,'INVALID_ATTEMPT_ID');
    const client=await pool.connect();
    try {const row=await getAttemptRow(client,playerId,attemptId);return attemptPayload(client,row);}finally{client.release();}
  }
  async function createAttempt(playerId,levelId){
    if(!isId(levelId))throw BAD(400,'INVALID_LEVEL_ID');
    const client=await pool.connect();let tx=false;
    try{
      await client.query('BEGIN');tx=true;
      // Serialize starts by the same user, preventing duplicate active attempts.
      const player=await client.query('SELECT id FROM players WHERE id=$1 FOR UPDATE',[playerId]);
      if(!player.rowCount)throw BAD(401,'UNAUTHORIZED');
      const level=await loadLevel(client,levelId);
      if(!level)throw BAD(404,'LEVEL_NOT_FOUND');
      const finished=await client.query('SELECT 1 FROM level_progress WHERE player_id=$1 AND level_id=$2',[playerId,levelId]);
      if(finished.rowCount)throw BAD(409,'LEVEL_ALREADY_COMPLETED');
      const active=await client.query(`SELECT id FROM puzzle_attempts WHERE player_id=$1 AND level_id=$2 AND status='in_progress'`,[playerId,levelId]);
      if(active.rowCount){
        const row=await getAttemptRow(client,playerId,active.rows[0].id);
        const response=await attemptPayload(client,row);
        await client.query('COMMIT');tx=false;
        return {created:false,attempt:response};
      }
      const {chars,cipherMap}=generateCipher(level.quote_text);
      const max=await client.query('SELECT COALESCE(MAX(attempt_number),0)+1 AS n FROM puzzle_attempts WHERE player_id=$1 AND level_id=$2',[playerId,levelId]);
      const attempt=await client.query(`INSERT INTO puzzle_attempts(player_id,level_id,attempt_number,cipher_map)
        VALUES($1,$2,$3,$4::jsonb) RETURNING id`,[playerId,levelId,Number(max.rows[0].n),JSON.stringify(cipherMap)]);
      const id=attempt.rows[0].id;
      const given=chooseGivens(chars,cipherMap,level.initial_reveal_count);
      for(const [position,ch] of chars.entries()){
        if(cipherMap[ch]===undefined)continue;
        await client.query(`INSERT INTO puzzle_cells(attempt_id,cell_position,cipher_number,given_letter)
          VALUES($1,$2,$3,$4)`,[id,position,cipherMap[ch],given.get(position)||null]);
      }
      const row=await getAttemptRow(client,playerId,id);
      const response=await attemptPayload(client,row);
      await client.query('COMMIT');tx=false;
      return {created:true,attempt:response};
    }catch(e){if(tx)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
  async function editCell(playerId,attemptId,position,value){
    if(!isId(attemptId)||!Number.isInteger(position)||position<0||position>499)throw BAD(400,'INVALID_CELL');
    const letter=value===null?null:cleanLetter(value);
    if(value!==null&&!letter)throw BAD(400,'INVALID_LETTER');
    const client=await pool.connect();let tx=false;
    try{
      await client.query('BEGIN');tx=true;
      const row=await getAttemptRow(client,playerId,attemptId,true);
      if(row.status!=='in_progress')throw BAD(409,'ATTEMPT_NOT_ACTIVE');
      const cell=await client.query(`UPDATE puzzle_cells SET entered_letter=$3 WHERE attempt_id=$1 AND cell_position=$2
        AND given_letter IS NULL RETURNING cell_position,cipher_number,entered_letter`,[attemptId,position,letter]);
      if(!cell.rowCount)throw BAD(409,'CELL_NOT_EDITABLE');
      await client.query('COMMIT');tx=false;
      // This SQL only updates the specified position. It never propagates equal numbers.
      return {position:Number(cell.rows[0].cell_position),number:Number(cell.rows[0].cipher_number),letter:cell.rows[0].entered_letter};
    }catch(e){if(tx)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
  async function editNote(playerId,attemptId,number,letterValue,comment){
    if(!isId(attemptId)||!Number.isInteger(number)||number<1||number>33||
       !(letterValue===null||cleanLetter(letterValue))||typeof comment!=='string'||comment.length>200)throw BAD(400,'INVALID_NOTE');
    const letter=letterValue===null?null:cleanLetter(letterValue);
    const client=await pool.connect();let tx=false;
    try {
      await client.query('BEGIN');tx=true;
      const row=await getAttemptRow(client,playerId,attemptId,true);
      if(row.status!=='in_progress')throw BAD(409,'ATTEMPT_NOT_ACTIVE');
      const exists=await client.query('SELECT 1 FROM puzzle_cells WHERE attempt_id=$1 AND cipher_number=$2 LIMIT 1',[attemptId,number]);
      if(!exists.rowCount)throw BAD(404,'CIPHER_NUMBER_NOT_IN_PUZZLE');
      const note=await client.query(`INSERT INTO puzzle_notes(attempt_id,cipher_number,candidate_letter,comment)
        VALUES($1,$2,$3,$4) ON CONFLICT(attempt_id,cipher_number)
        DO UPDATE SET candidate_letter=EXCLUDED.candidate_letter,comment=EXCLUDED.comment,updated_at=NOW()
        RETURNING cipher_number,candidate_letter,comment`,[attemptId,number,letter,comment]);
      await client.query('COMMIT');tx=false;
      return {number:Number(note.rows[0].cipher_number),letter:note.rows[0].candidate_letter,comment:note.rows[0].comment};
    }catch(e){if(tx)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
  async function check(playerId,attemptId){
    if(!isId(attemptId))throw BAD(400,'INVALID_ATTEMPT_ID');
    const client=await pool.connect();let tx=false;
    try{
      await client.query('BEGIN');tx=true;
      const row=await getAttemptRow(client,playerId,attemptId,true);
      if(row.status==='solved')throw BAD(409,'ALREADY_SOLVED');
      if(row.status!=='in_progress')throw BAD(409,'ATTEMPT_NOT_ACTIVE');
      if(row.last_checked_at && (Date.now()-new Date(row.last_checked_at).getTime())<CHECK_COOLDOWN_SECONDS*1000)
        throw BAD(429,'CHECK_COOLDOWN');
      const cells=await client.query('SELECT cell_position,given_letter,entered_letter FROM puzzle_cells WHERE attempt_id=$1',[attemptId]);
      const allFilled=cells.rows.every(c=>c.given_letter!==null||c.entered_letter!==null);
      if(!allFilled)throw BAD(409,'PUZZLE_INCOMPLETE');
      const correct=isSolved(row.quote_text,cells.rows);
      await client.query('UPDATE puzzle_attempts SET last_checked_at=NOW() WHERE id=$1',[attemptId]);
      if(!correct){
        await client.query('UPDATE puzzle_attempts SET mistakes=mistakes+1 WHERE id=$1',[attemptId]);
        await client.query('COMMIT');tx=false;
        return {correct:false,mistakes:row.mistakes+1,retryAfterSeconds:CHECK_COOLDOWN_SECONDS};
      }
      await client.query("UPDATE puzzle_attempts SET status='solved',completed_at=NOW() WHERE id=$1",[attemptId]);
      await client.query(`INSERT INTO level_progress(player_id,level_id,completed_attempt_id,best_mistakes)
        VALUES($1,$2,$3,$4) ON CONFLICT(player_id,level_id) DO NOTHING`,[playerId,row.level_id,attemptId,row.mistakes]);
      const options=await bonusChoices(client,row);
      await client.query('COMMIT');tx=false;
      return {correct:true,attemptId,bonusOptions:options,rewardCoins:0,comment:'Economy and rewards are reserved for stage 05'};
    }catch(e){if(tx)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
  async function bonusChoices(client,row){
    const choices=await client.query(`SELECT cr.id,cr.display_name FROM creators cr
      JOIN creator_categories cc ON cc.creator_id=cr.id AND cc.category_slug=$2
      WHERE cr.id<>$1 ORDER BY md5(cr.id::text || $3::text) LIMIT 3`,
      [row.creator_id,row.category_slug,row.id]);
    const real=await client.query('SELECT id,display_name FROM creators WHERE id=$1',[row.creator_id]);
    const all=[...choices.rows,...real.rows].map(({id,display_name})=>({id,name:display_name}));
    // Deterministic shuffle by saved attempt ID (options stable across GET calls).
    return all.sort((a,b)=>{const s=require('node:crypto').createHash;return s('sha256').update(row.id+a.id).digest('hex').localeCompare(s('sha256').update(row.id+b.id).digest('hex'));});
  }
  async function reveal(client,row,bonus){
    const q=await client.query(`SELECT cr.display_name,ms.source_url,ms.verification_status,ms.rights_status
      FROM creators cr LEFT JOIN quotes qt ON qt.creator_id=cr.id AND qt.id=(SELECT quote_id FROM levels WHERE id=$2)
      LEFT JOIN media_sources ms ON ms.id=qt.source_id WHERE cr.id=$1`,[row.creator_id,row.level_id]);
    return {quote:row.quote_text,creator:q.rows[0]?.display_name||null,
      sourceUrl:q.rows[0]?.source_url||null,sourceVerified:q.rows[0]?.verification_status==='verified',
      mediaRights:q.rows[0]?.rights_status||'unknown',bonusResult:bonus.result};
  }
  async function answerBonus(playerId,attemptId,guessedCreatorId){
    if(!isId(attemptId)||!(guessedCreatorId===null||isId(guessedCreatorId)))throw BAD(400,'INVALID_BONUS_ANSWER');
    const client=await pool.connect();let tx=false;
    try{
      await client.query('BEGIN');tx=true;
      const row=await getAttemptRow(client,playerId,attemptId,true);
      if(row.status!=='solved')throw BAD(409,'BONUS_LOCKED');
      const existing=await client.query('SELECT 1 FROM bonus_answers WHERE attempt_id=$1',[attemptId]);
      if(existing.rowCount)throw BAD(409,'BONUS_ALREADY_ANSWERED');
      const opts=await bonusChoices(client,row);
      if(guessedCreatorId!==null&&!opts.some(o=>o.id===guessedCreatorId))throw BAD(400,'INVALID_BONUS_CHOICE');
      const result=guessedCreatorId===null?'skipped':guessedCreatorId===row.creator_id?'correct':'incorrect';
      await client.query(`INSERT INTO bonus_answers(attempt_id,guessed_creator_id,result,reward_coins)
        VALUES($1,$2,$3,0)`,[attemptId,guessedCreatorId,result]);
      const answer=await reveal(client,row,{result});
      await client.query('COMMIT');tx=false;
      return {result,reveal:answer,rewardCoins:0};
    }catch(e){if(tx)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
  return {authenticate,categories,listLevels,createAttempt,getAttempt,editCell,editNote,check,answerBonus};
}
module.exports={makeGameService,BAD,isId,CHECK_COOLDOWN_SECONDS};
