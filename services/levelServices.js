const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/levels/levels.json');
console.log('📁 levelServices: __dirname =', __dirname);
console.log('📁 levelServices: filePath =', filePath);
console.log('📁 levelServices: existsSync =', fs.existsSync(filePath));

function readLevels() {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ Ошибка чтения levels.json:', err);
    throw err;
  }
}


function writeLevels(levels) {
  fs.writeFileSync(filePath, JSON.stringify(levels, null, 2), 'utf-8');
}

exports.getLevels = () => {
  return readLevels();
};

exports.getLevelById = (id) => {
  const levels = readLevels();
  return levels.find(l => l.id == id);
};

exports.addLevel = (newLevel) => {
  const levels = readLevels();
  newLevel.id = levels.length > 0 ? levels[levels.length - 1].id + 1 : 1;
  levels.push(newLevel);
  writeLevels(levels);
  return newLevel;
};
