'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const catalog=require('../content/quote_candidates_42_v5.json');
const {splitQuote}=require('../lib/puzzleText');
test('exactly 42 draft candidates split across 3 categories',()=>{
  assert.equal(catalog.quotes.length,42);
  const counts={streamers:0,bloggers:0,tiktokers:0};
  for(const q of catalog.quotes){
    assert.ok(Object.hasOwn(counts,q.category));counts[q.category]++;
    assert.equal(q.publication_status,'draft');
    assert.equal(q.audio_verified,false);
    splitQuote(q.quote);
  }
  assert.deepEqual(counts,{streamers:22,bloggers:8,tiktokers:12});
});
test('importer never publishes draft content or modifies balances',()=>{
  const fs=require('node:fs');const src=fs.readFileSync(require('node:path').join(__dirname,'../scripts/content-import-drafts.js'),'utf8');
  assert.match(src,/is_published\)\s*VALUES[\s\S]*FALSE/);
  assert.match(src,/status,editorial_notes,external_key/);
  assert.doesNotMatch(src,/UPDATE players SET coins/);
});
