const express = require('express');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const levelsRouter = require('./routes/levels');
const playerRoutes = require('./routes/player');

app.use(express.json());
app.use('/levels', levelsRouter);
app.use('/player', playerRoutes);

// PostgreSQL подключение
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://game_blogergramm_user:YbRO63X3x1rb3lXijJc4XEnGueMJImgO@dpg-d19h4kili9vc7380pvc0-a/game_blogergramm',
  ssl: {
    rejectUnauthorized: false
  }
});

// Инициализация базы из init.sql
async function initializeDatabase() {
  const sql = fs.readFileSync('./init.sql', 'utf-8');
  try {
    await pool.query(sql);
    console.log('✅ База инициализирована');
  } catch (err) {
    console.error('❌ Ошибка инициализации базы:', err);
  }
}
initializeDatabase();

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
