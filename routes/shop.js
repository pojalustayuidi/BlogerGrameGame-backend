const express = require('express');
const router = express.Router();
const pool = require('../db');


// Получение списка товаров
// Получение списка товаров из базы
router.get('/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shop_items ORDER BY cost ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при получении товаров:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Совершение покупки
router.post('/buy', async (req, res) => {
  const { playerId, itemId } = req.body;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Получаем товар из базы
    const itemResult = await client.query('SELECT * FROM shop_items WHERE id = $1', [itemId]);
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Товар не найден' });
    }
    const item = itemResult.rows[0];

    // Получаем игрока с блокировкой
    const playerResult = await client.query(
      'SELECT coins, lives FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    const player = playerResult.rows[0];

    // Проверяем монеты
    if (player.coins < item.cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно монет' });
    }

    // Проверяем жизни, если покупаем жизнь
    if (item.type === 'life' && player.lives >= 5) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Максимум жизней достигнут' });
    }

    // Здесь продолжай логику покупки: списание монет, добавление жизни или подсказки и т.п.

    await client.query('COMMIT');
    res.json({ success: true, message: 'Покупка успешна' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Ошибка при покупке:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    if (client) client.release();
  }
});

// Получение истории покупок игрока
router.get('/history/:playerId', async (req, res) => {
  const { playerId } = req.params;

  try {
    const result = await pool.query(
      'SELECT item_id, item_name, cost, purchased_at FROM shop_purchases WHERE player_id = $1 ORDER BY purchased_at DESC',
      [playerId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при получении истории покупок:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
