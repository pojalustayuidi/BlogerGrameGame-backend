const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('./db'); // подключение к PostgreSQL
const levelsRouter = require('./routes/levels');
const playerRouter = require('./routes/player');
const shopRouter = require('./routes/shop');
const adminRoutes = require('./routes/admin');
const app = express();
app.use(express.json());

// Инициализация таблиц (например, players)
const initSQL = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
pool.query(initSQL)
  .then(() => console.log('✅ Таблицы инициализированы'))
  .catch(err => console.error('❌ Ошибка инициализации таблиц:', err));

// Маршруты
app.use('/levels', levelsRouter);
app.use('/player', playerRouter);
app.use('/shop', shopRouter);
app.use('/admin', adminRoutes);

// Заглушка для сохранения прогресса
app.post('/progress', (req, res) => {
  const { userId, levelId } = req.body;

  if (!userId || !levelId) {
    return res.status(400).json({ error: 'userId и levelId обязательны' });
  }

  console.log(`Игрок ${userId} прошёл уровень ${levelId}`);
  res.status(200).json({ message: 'Прогресс принят (заглушка)' });
});

// Запуск сервера
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
