const fs = require('fs');

// Исходные уровни без letterMap
const rawLevels = [
  {
    id: 1,
    quote: "Я император юмора, я делаю, что хочу, и не советуюсь с отребьем, которому ничего не должен.",
    author: "Юрий Хованский",
    revealed: [0, 3, 8, 15, 22, 27]
  },
  {
    id: 2,
    quote: "Я могу приравнять лудоманию к реальной зависимости.",
    author: "Mellstroy",
    revealed: [1, 5, 9, 14]
  }
];

// Функция перемешивания массива
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Генератор letterMap: { "а": 7, "б": 2, ... }
function assignNumbersToLetters(quote) {
  const cleaned = quote.replace(/[^а-яёА-ЯЁ]/gi, '').toLowerCase();
  const uniqueLetters = [...new Set(cleaned.split(''))];
  const numbers = shuffle(Array.from({ length: 33 }, (_, i) => i + 1)); // 1–33

  const letterMap = {};
  uniqueLetters.forEach((letter, idx) => {
    letterMap[letter] = numbers[idx];
  });

  return letterMap;
}

// Обновляем уровни
const enrichedLevels = rawLevels.map(level => ({
  ...level,
  letterMap: assignNumbersToLetters(level.quote)
}));

// Сохраняем
fs.writeFileSync('./data/levels.json', JSON.stringify(enrichedLevels, null, 2), 'utf-8');
console.log('✅ levels.json обновлён с letterMap!');
