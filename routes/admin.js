const express = require('express');
const router = express.Router();
const pool = require('../db');

// Админ-эндпоинт для выдачи монет
router.post('/give-coins', async (req, res) => {
  const { playerId, coins } = req.body;

  if (!playerId || typeof coins !== 'number') {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  try {
    const result = await pool.query(
      'UPDATE players SET coins = $1 WHERE id = $2 RETURNING *',
      [coins, playerId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    res.json({ message: 'Монеты успешно выданы', coins: result.rows[0].coins });
  } catch (err) {
    console.error('Ошибка при выдаче монет:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
