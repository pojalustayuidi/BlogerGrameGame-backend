const express = require('express');
const router = express.Router();
const pool = require('../db');

// Каталог товаров
const shopItems = [
  { id: 'hint', name: 'Подсказка', cost: 8 },
  { id: 'hint3', name: '3 Подсказки (скидка)', cost: 20 },
  { id: 'life', name: '1 Жизнь', cost: 15 },
  { id: 'life5', name: '5 Жизней (скидка)', cost: 70 }
];

// Получение списка товаров
router.get('/items', (req, res) => {
  res.json(shopItems);
});

// Совершение покупки
router.post('/buy', async (req, res) => {
  const { playerId, itemId } = req.body;

  const item = shopItems.find(i => i.id === itemId);
  if (!item) {
    return res.status(400).json({ error: 'Товар не найден' });
  }

  try {
    const client = await pool.connect();
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

    let newLives = player.lives;

    // Если покупка жизней
    if (item.id === 'life') {
      newLives += 1;
    } else if (item.id === 'life5') {
      newLives += 5;
    }

    await client.query(
      'UPDATE players SET coins = coins - $1, lives = $2 WHERE id = $3',
      [item.cost, newLives, playerId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Покупка успешна', newCoins: player.coins - item.cost, newLives });
  } catch (err) {
    console.error('Ошибка при покупке:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
