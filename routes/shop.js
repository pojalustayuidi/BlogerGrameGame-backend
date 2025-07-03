const express = require('express');
const router = express.Router();
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// Получение списка товаров
router.get('/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shop_items ORDER BY cost ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при получении товаров:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.post('/buy', async (req, res) => {
  const { playerId, itemId } = req.body;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const itemResult = await client.query('SELECT * FROM shop_items WHERE id = $1', [itemId]);
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Товар не найден' });
    }
    const item = itemResult.rows[0];
    if (!item.type.startsWith('hint')) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Этот товар не является подсказкой' });
    }


    const playerResult = await client.query(
      'SELECT coins, lives FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    const player = playerResult.rows[0];

    // Проверяем, хватает ли монет
    if (player.coins < item.cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно монет' });
    }

    // Списываем монеты
    const hintAmount = parseInt(item.type.replace('hint', '')) || 1;
    const newHints = (player.hints || 0) + hintAmount;
    const newCoins = player.coins - item.cost;

    // Обновляем жизни, если куплена жизнь (можно покупать сверх 5)
    let newLives = player.lives;
    if (item.type === 'life') {
      const amount = item.amount || 1;
      newLives = player.lives + amount;
    }

    // Обновляем данные игрока
    await client.query( 
      'UPDATE players SET coins = $1, lives = $2, hints = $3 WHERE id = $4',
      [newCoins, newLives, playerId, newHints]
    );

    // Добавляем запись в историю покупок
    const purchaseId = uuidv4();
    await client.query(
      'INSERT INTO shop_purchases (id, player_id, item_id, purchased_at) VALUES ($1, $2, $3, NOW())',
      [purchaseId, playerId, item.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Покупка успешна', newCoins, newLives, newHints});
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Ошибка при покупке:', err);
    res.status(500).json({ error: 'Ошибка сервера' });  
  } finally {
    if (client) client.release();
  }
});

router.get('/:playerId/hints', async (req, res) => {
  const { playerId } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT hints FROM players WHERE id = $1',
      [playerId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    
    res.json({ 
      hints: result.rows[0].hints || 0,
      maxHints: 20 // Можно получать и из конфига
    });
  } catch (err) {
    console.error('Ошибка при получении подсказок:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.post('/:playerId/use-hint', async (req, res) => {
  const { playerId } = req.params;
  
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    
    // Проверяем наличие подсказок
    const result = await client.query(
      'SELECT hints FROM players WHERE id = $1 FOR UPDATE',
      [playerId]
    );
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    
    const currentHints = result.rows[0].hints || 0;
    if (currentHints <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Нет доступных подсказок' });
    }
    
    // Уменьшаем количество подсказок
    await client.query(
      'UPDATE players SET hints = hints - 1 WHERE id = $1',
      [playerId]
    );
    
    await client.query('COMMIT');
    res.json({ 
      success: true, 
      remainingHints: currentHints - 1 
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Ошибка при использовании подсказки:', err);
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
      'SELECT item_id, purchased_at FROM shop_purchases WHERE player_id = $1 ORDER BY purchased_at DESC',
      [playerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при получении истории покупок:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
