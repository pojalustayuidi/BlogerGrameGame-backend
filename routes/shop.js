const express = require('express');
const router = express.Router();
const pool = require('../db');

// Каталог товаров
const shopItems = [
  { id: 'hint', name: 'Подсказка', description: 'Открывает одну букву', cost: 8, type: 'hint' },
  { id: 'hint3', name: '3 Подсказки (скидка)', description: 'Открывает три буквы', cost: 20, type: 'hint' },
  { id: 'life', name: '1 Жизнь', description: 'Добавляет одну жизнь', cost: 15, type: 'life' },
  { id: 'life5', name: '5 Жизней (скидка)', description: 'Добавляет пять жизней', cost: 70, type: 'life' }
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
      client.release();
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const player = playerResult.rows[0];

    if (player.coins < item.cost) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Недостаточно монет' });
    }

    if (item.type === 'life' && player.lives >= 5) {
      await client.query('ROLLBACK');
      client.release();
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

    await client.query('COMMIT');
    client.release();
    res.json({ message: 'Покупка успешна', newCoins: player.coins - item.cost, newLives });
  } catch (err) {
    console.error('Ошибка при покупке:', err);
    await client.query('ROLLBACK');
    client.release();
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;