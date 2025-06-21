const fs = require('fs');

const rawLevels = [
  {
    id: 1,
    quote: "Я не тупой — просто у меня своё видение ситуации.",
    author: "Эдвард Бил",
    revealed: [0, 3, 8, 15, 22, 27]
  },
  {
    id: 2,
    quote: "У нас тут не шоу, а реальная жизнь, между прочим",
    author: "Ян Топлес",
    revealed: [1, 5, 9, 14]
  },
   {
    id: 3,
    quote: "Если у тебя нет плана Б, то лучше не начинать вообще",
    author: "Мамикс",
    revealed: [0, 6, 10, 18, 24, 31]
  },
   {
    id: 4,
    quote: "Если думаешь, что это предел — игра только начинается..",
    author: "Лололошка",
    revealed: [0, 5, 14, 20, 29, 2]
  },
   {
    id: 5,
    quote: "Живи быстро, умри молодым, оставь после себя легенду",
    author: "Эксайл",
    revealed: [0, 3, 8, 15, 22, 27]
  },
   {
    id: 6,
    quote: "Когда играешь — ты не просто игрок, ты творец своей истории",
    author: "ФреймТеймер",
    revealed: [0, 3, 8, 15, 22, 27]
  },
   {
    id: 7,
    quote: "Юмор — это лекарство от всех беди",
    author: "Сатир",
    revealed: [0, 3, 8, 15, 22, 27]
  },
   {
    id: 8,
    quote: "Не останавливайся на достигнутом, всегда стремись к большему",
    author: "Ноуки",
    revealed: [0, 3, 8, 15, 22, 27]
  },
];


function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}


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


const enrichedLevels = rawLevels.map(level => ({
  ...level,
  letterMap: assignNumbersToLetters(level.quote)
}));

fs.writeFileSync('./data/levels.json', JSON.stringify(enrichedLevels, null, 2), 'utf-8');
console.log(' levels.json обновлён с letterMap!');
