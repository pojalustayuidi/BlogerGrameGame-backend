const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/levels/level.json');
console.log('📁 levelService: __dirname =', __dirname);
console.log('📁 levelService: filePath =', filePath);
console.log('📁 levelService: existsSync =', fs.existsSync(filePath));

// Проверяем существование директории и создаем, если отсутствует
const dirPath = path.join(__dirname, '../data/levels');
if (!fs.existsSync(dirPath)) {
  console.log('📁 levelService: Создаем директорию', dirPath);
  fs.mkdirSync(dirPath, { recursive: true });
}

function readLevels() {
  try {
    if (!fs.existsSync(filePath)) {
      console.log('📁 levelService: Файл level.json не найден, создаем с дефолтным содержимым');
      const defaultLevels = [
        {
          id: 1,
          quote: "Я император юмора, я делаю, что хочу, и не советуюсь с отребьем, которому ничего не должен.",
          author: "Юрий Хованский",
          revealed: [0, 3, 8, 15, 22, 27]
        },
        {
          id: 2,
          quote: "Я могу приравнять лудоманию к реальной зависимости.",
          author: "Mellstroy1",
          revealed: [1, 5, 9, 14]
        }
      ];
      fs.writeFileSync(filePath, JSON.stringify(defaultLevels, null, 2), 'utf-8');
    }
    console.log('📁 levelService: Читаем level.json');
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ levelService: Ошибка чтения level.json:', err);
    throw err;
  }
}

function writeLevels(levels) {
  try {
    console.log('📁 levelService: Записываем level.json');
    fs.writeFileSync(filePath, JSON.stringify(levels, null, 2), 'utf-8');
  } catch (err) {
    console.error('❌ levelService: Ошибка записи level.json:', err);
    throw err;
  }
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