'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cleanLetter,splitQuote,generateCipher,chooseGivens,renderLayout,isSolved,publicLevel}=require('../lib/puzzleText');
test('Russian letters only, including Ё and lowercase input normalization',()=>{
  assert.equal(cleanLetter('ё'),'Ё');assert.equal(cleanLetter('а'),'А');
  for(const bad of ['AB','A','1','!','',null,'яй'])assert.equal(cleanLetter(bad),null);
});
test('Reject Latin text, allow punctuation and spaces',()=>{
  assert.throws(()=>splitQuote('KUPlinov play'),/NON_RUSSIAN_QUOTE/);
  assert.deepEqual(splitQuote('Ёж — да!'),['Ё','Ж',' ','—',' ','Д','А','!']);
});
test('Random mapping is bijective and stable for repeated letters',()=>{
  const {chars,cipherMap}=generateCipher('КОТ И КИТ');
  assert.equal(chars[0],'К');assert.equal(chars[7],'И');
  assert.equal(Object.keys(cipherMap).length,4);
  assert.equal(new Set(Object.values(cipherMap)).size,4);
  for(const value of Object.values(cipherMap))assert.ok(value>=1&&value<=33);
});
test('Given hints affect selected positions, not every repeated number',()=>{
  const {chars,cipherMap}=generateCipher('КОТ И КИТ');
  const givens=chooseGivens(chars,cipherMap,2);
  assert.equal(givens.size,2);
  assert.equal(new Set(givens.values()).size,2);
});
test('Layout contains number and only player-entered/initial letters',()=>{
  const layout=renderLayout('КОТ!',[
    {cell_position:0,cipher_number:19,given_letter:null,entered_letter:'К'},
    {cell_position:1,cipher_number:6,given_letter:null,entered_letter:null},
    {cell_position:2,cipher_number:9,given_letter:'Т',entered_letter:null}
  ]);
  assert.deepEqual(layout,[
    {position:0,type:'letter',number:19,given:null,letter:'К'},
    {position:1,type:'letter',number:6,given:null,letter:null},
    {position:2,type:'letter',number:9,given:'Т',letter:null},
    {position:3,type:'separator',value:'!'}]);
});
test('Two identical-numbered cells are validated independently',()=>{
  const rows=[
    {cell_position:0,entered_letter:'К',given_letter:null},
    {cell_position:1,entered_letter:'О',given_letter:null},
    {cell_position:2,entered_letter:'Т',given_letter:null},
    {cell_position:4,entered_letter:null,given_letter:null},
    {cell_position:5,entered_letter:'О',given_letter:null},
    {cell_position:6,entered_letter:'Т',given_letter:null}
  ];
  assert.equal(isSolved('КОТ КОТ',rows),false);
  rows[3].entered_letter='К';
  assert.equal(isSolved('КОТ КОТ',rows),true);
});
test('Published list metadata excludes quote, creator and source',()=>{
  const dto=publicLevel({id:'one',category_slug:'streamers',level_number:1,difficulty:'hard',letter_count:68,is_preview:true,completed:false,quote_text:'SECRET',display_name:'SECRET'});
  assert.equal(JSON.stringify(dto).includes('SECRET'),false);
  assert.equal(dto.letters,68);
});
