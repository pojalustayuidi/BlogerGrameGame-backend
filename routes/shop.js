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

    // Списание монет
    await client.query(
      'UPDATE players SET coins = coins - $1 WHERE id = $2',
      [item.cost, playerId]
    );

    // Добавление жизни (если покупаем жизнь)
    if (item.type === 'life') {
      await client.query(
        'UPDATE players SET lives = lives + 1 WHERE id = $1',
        [playerId]
      );
    }

    // Запись истории покупки
    await client.query(
      'INSERT INTO shop_purchases (player_id, item_id, item_name, cost, purchased_at) VALUES ($1, $2, $3, $4, NOW())',
      [playerId, item.id, item.name, item.cost]
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
