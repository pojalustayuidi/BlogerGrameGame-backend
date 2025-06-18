const express = require('express');
const app = express();
const levelsRouter = require('./routes/levels');
const playerRouter = require('./routes/player'); // ✅ название должно совпадать

app.use(express.json());
app.use('/levels', levelsRouter);
app.use('/player', playerRouter); // ✅ подключаем как middleware

// Заглушка для прогресса
app.post('/progress', (req, res) => {
  const { userId, levelId } = req.body;
  if (!userId || !levelId) {
    return res.status(400).json({ error: 'userId и levelId обязательны' });
  }
  console.log(`Игрок ${userId} прошёл уровень ${levelId}`);
  res.status(200).json({ message: 'Прогресс принят (заглушка)' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
