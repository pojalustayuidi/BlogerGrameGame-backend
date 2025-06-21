const { v4: uuidv4 } = require('uuid');

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

    // Списываем монеты
    await client.query(
      'UPDATE players SET coins = coins - $1 WHERE id = $2',
      [item.cost, playerId]
    );

    // Добавляем жизнь, если item.type == 'life'
    if (item.type === 'life') {
      await client.query(
        'UPDATE players SET lives = lives + 1 WHERE id = $1',
        [playerId]
      );
    }

    // Добавляем запись о покупке
    const purchaseId = uuidv4();
    await client.query(
      'INSERT INTO shop_purchases (id, player_id, item_id, purchased_at) VALUES ($1, $2, $3, NOW())',
      [purchaseId, playerId, item.id]
    );

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
