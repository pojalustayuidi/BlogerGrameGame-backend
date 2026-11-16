'use strict';
// Imports only into a local PostgreSQL database. No quote is published.
const fs=require('node:fs');
const path=require('node:path');
const pool=require('../db');
const {splitQuote}=require('../lib/puzzleText');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','content','quote_candidates_42_v5.json'),'utf8'));
const DIFFICULTY={easy:'easy',normal:'normal',medium:'normal',medium_hard:'hard',hard:'hard',expert:'expert',bonus:'easy'};
const PLATFORM=url=>url.includes('youtube.com')||url.includes('youtu.be')?'youtube':url.includes('tiktok.com')?'tiktok':url.includes('twitch.tv')?'twitch':url.includes('vk.com')?'vk':url.includes('rutube.ru')?'rutube':'other';
async function run(){
  if(!Array.isArray(catalog.quotes)||catalog.quotes.length!==42)throw new Error('Catalog must contain exactly 42 candidates');
  const client=await pool.connect();
  let tx=false;
  try{
    await client.query('BEGIN');tx=true;
    await client.query('SELECT pg_advisory_xact_lock($1,$2)',[404,4]);
    const nums={streamers:0,bloggers:0,tiktokers:0};
    for(const q of catalog.quotes){
      if(!Object.hasOwn(nums,q.category)||typeof q.creator!=='string'||typeof q.id!=='string')throw new Error(`Invalid catalog row ${q.id}`);
      splitQuote(q.quote); // rejects Latin letters, missing Russian characters
      const creatorKey=`draft-v5:creator:${q.creator.toLocaleLowerCase('ru-RU')}`;
      const cr=await client.query(`INSERT INTO creators(display_name,status,external_key)
        VALUES($1,'draft',$2) ON CONFLICT(external_key) DO UPDATE SET external_key=EXCLUDED.external_key RETURNING id`,[q.creator,creatorKey]);
      const creatorId=cr.rows[0].id;
      await client.query(`INSERT INTO creator_categories(creator_id,category_slug) VALUES($1,$2) ON CONFLICT DO NOTHING`,[creatorId,q.category]);
      let sourceId=null;
      if(typeof q.source_url==='string'&&q.source_url.startsWith('https://')){
        const source=await client.query(`INSERT INTO media_sources(creator_id,platform,source_url,verification_status,rights_status,external_key)
          VALUES($1,$2,$3,'unverified','unknown',$4)
          ON CONFLICT(external_key) DO UPDATE SET external_key=EXCLUDED.external_key RETURNING id`,
          [creatorId,PLATFORM(q.source_url),q.source_url,`draft-v5:source:${q.id}`]);
        sourceId=source.rows[0].id;
      }
      const quote=await client.query(`INSERT INTO quotes(creator_id,source_id,quote_text,difficulty,status,editorial_notes,external_key)
        VALUES($1,$2,$3,$4,'draft',$5,$6)
        ON CONFLICT(external_key) DO UPDATE SET external_key=EXCLUDED.external_key RETURNING id`,
        [creatorId,sourceId,q.quote,DIFFICULTY[q.difficulty]||'normal',JSON.stringify({sourceType:q.source_type||'',audioVerified:false,warning:'DRAFT — check attribution, media and rights before publishing',evidence:q.evidence||''}),`draft-v5:quote:${q.id}`]);
      nums[q.category]++;
      await client.query(`INSERT INTO levels(category_slug,quote_id,level_number,initial_reveal_count,reward_coins,is_published)
        VALUES($1,$2,$3,$4,30,FALSE) ON CONFLICT(quote_id) DO NOTHING`,
        [q.category,quote.rows[0].id,nums[q.category],q.difficulty==='bonus'?2:3]);
    }
    await client.query('COMMIT');tx=false;
    console.log('Imported draft-only candidates:',nums);
    console.log('No quote/level/video was published. Run again safely to verify idempotency.');
  } catch(e){if(tx)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
run().catch(e=>{console.error('Import failed:',e.message);process.exitCode=1}).finally(()=>pool.end());
