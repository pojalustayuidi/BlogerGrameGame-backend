const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const levelsRouter = require('./routes/levels');
const playerRouter = require('./routes/player'); // Новый маршрут для /register

app.use(express.json());

// Роут для получения уровней
app.use('/levels', levelsRouter);

// Роут для регистрации и других операций с игроками
app.use('/', playerRouter);

// Заглушка для сохранения прогресса
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

