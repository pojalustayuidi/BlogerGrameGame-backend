const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

// Регистрация игрока
router.post('/register', async (req, res) => {
  const id = uuidv4();

  try {
    await pool.query(
      'INSERT INTO players (id) VALUES ($1)',
      [id]
    );

    res.status(201).json({ playerId: id });
  } catch (err) {
    console.error('Ошибка при регистрации:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение игрока
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT id, created_at FROM players WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка при получении игрока:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Заглушка для обновления прогресса
router.post('/progress', async (req, res) => {
  const { playerId, levelId } = req.body;

  if (!playerId || !levelId) {
    return res.status(400).json({ error: 'playerId и levelId обязательны' });
  }

  console.log(`Игрок ${playerId} прошёл уровень ${levelId}`);
  res.status(200).json({ message: 'Прогресс принят (заглушка)' });
});

module.exports = router;
