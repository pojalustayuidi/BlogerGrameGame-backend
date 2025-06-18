const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db'); // подключаем базу

const router = express.Router();

// POST /player/register
router.post('/register', async (req, res) => {
  const playerId = uuidv4();

  try {
    // Вставляем игрока в таблицу players
    await pool.query(
      'INSERT INTO players (id, created_at) VALUES ($1, NOW())',
      [playerId]
    );

    res.status(201).json({ playerId });
  } catch (err) {
    console.error('Ошибка при регистрации игрока:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
