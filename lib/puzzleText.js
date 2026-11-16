'use strict';
const {randomInt}=require('node:crypto');
const LETTER=/^[А-ЯЁ]$/u;
function cleanLetter(value) {
  if (typeof value!=='string') return null;
  const x=value.toLocaleUpperCase('ru-RU');
  return LETTER.test(x)?x:null;
}
function splitQuote(text) {
  if(typeof text!=='string'||text.length<3||text.length>500)throw new Error('INVALID_QUOTE');
  const chars=[...text.toLocaleUpperCase('ru-RU')];
  // This is a strictly Cyrillic game mode, not an implicit transliterator.
  if(chars.some(c=>/^[A-Z]$/.test(c)))throw new Error('NON_RUSSIAN_QUOTE');
  if(!chars.some(c=>LETTER.test(c)))throw new Error('NO_LETTERS');
  return chars;
}
function generateCipher(text) {
  const chars=splitQuote(text);
  const unique=[...new Set(chars.filter(ch=>LETTER.test(ch)))];
  const numbers=Array.from({length:33},(_,i)=>i+1);
  // CSPRNG Fisher-Yates; independent randomized mapping for each attempt.
  for(let i=numbers.length-1;i>0;i--){const j=randomInt(i+1);[numbers[j],numbers[i]]=[numbers[i],numbers[j]];}
  const cipherMap=Object.fromEntries(unique.map((x,i)=>[x,numbers[i]]));
  return {chars,cipherMap};
}
function chooseGivens(chars,cipherMap,count){
  const positions=new Map();
  chars.forEach((c,i)=>{if(cipherMap[c]!==undefined&&!positions.has(c))positions.set(c,i);});
  const pairs=[...positions.entries()];
  for(let i=pairs.length-1;i>0;i--){const j=randomInt(i+1);[pairs[j],pairs[i]]=[pairs[i],pairs[j]];}
  return new Map(pairs.slice(0,Math.min(count,pairs.length)).map(([c,pos])=>[pos,c]));
}
function renderLayout(text,cellRows) {
  const chars=splitQuote(text);
  const cells=new Map(cellRows.map(row=>[Number(row.cell_position),row]));
  return chars.map((ch,position)=>LETTER.test(ch)?(() => {
    const row=cells.get(position);
    if(!row)throw new Error(`Missing encrypted cell at ${position}`);
    return {position,type:'letter',number:Number(row.cipher_number),given:row.given_letter||null,letter:row.entered_letter||null};
  })():{position,type:'separator',value:ch});
}
function isSolved(text,cellRows){
  const chars=splitQuote(text);
  const rows=new Map(cellRows.map(r=>[Number(r.cell_position),r]));
  return chars.every((ch,pos)=> !LETTER.test(ch) || ((rows.get(pos)?.given_letter || rows.get(pos)?.entered_letter)===ch));
}
function publicLevel(r){return {id:r.id,category:r.category_slug,number:r.level_number,difficulty:r.difficulty,letters:r.letter_count,preview:r.is_preview===true,completed:r.completed===true};}
module.exports={cleanLetter,splitQuote,generateCipher,chooseGivens,renderLayout,isSolved,publicLevel};
