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

  const item = shopItems.find(i => i.id === itemId);
  if (!item) {
    return res.status(400).json({ error: 'Товар не найден' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const playerResult = await client.query(
      'SELECT coins, lives FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const player = playerResult.rows[0];

    if (player.coins < item.cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно монет' });
    }

    if (item.type === 'life' && player.lives >= 5) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Максимум жизней достигнут' });
    }

    let newLives = player.lives;
    if (item.id === 'life') {
      newLives = Math.min(player.lives + 1, 5);
    } else if (item.id === 'life5') {
      newLives = Math.min(player.lives + 5, 5);
    }

    await client.query(
      'UPDATE players SET coins = coins - $1, lives = $2 WHERE id = $3',
      [item.cost, newLives, playerId]
    );

    await client.query(
      'INSERT INTO shop_purchases (player_id, item_id, item_name, cost) VALUES ($1, $2, $3, $4)',
      [playerId, item.id, item.name, item.cost]
    );

    await client.query('COMMIT');
    res.json({ message: 'Покупка успешна', newCoins: player.coins - item.cost, newLives });
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
