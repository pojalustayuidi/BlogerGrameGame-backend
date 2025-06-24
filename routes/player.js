const express = require('express');
const router = express.Router();
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// Регистрация игрока
router.post('/register', async (req, res) => {
  const id = uuidv4();
  try {
    await pool.query(
      'INSERT INTO players (id, created_at, coins, lives, last_life_update) VALUES ($1, NOW(), $2, $3, NOW())',
      [id, 0, 5]
    );

    await pool.query(
      'INSERT INTO progress (player_id, current_level, updated_at) VALUES ($1, $2, NOW())',
      [id, 1]
    );

    res.status(201).json({ playerId: id });
  } catch (err) {
    console.error('Ошибка при регистрации:', err);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
});

// Получение данных игрока
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка при получении данных игрока:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновление массива progress (список пройденных уровней)
router.post('/:id/progress', async (req, res) => {
  const { id } = req.params;
  const { levelId } = req.body;

  if (!levelId) {
    return res.status(400).json({ error: 'levelId обязателен' });
  }

  try {
    await pool.query(`
      UPDATE players
      SET progress = ARRAY(SELECT DISTINCT unnest(COALESCE(progress, '{}') || $1::text[]))
      WHERE id = $2
    `, [[levelId.toString()], id]);

    res.status(200).json({ message: 'Прогресс обновлён' });
  } catch (err) {
    console.error('Ошибка при обновлении массива progress:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сохранение текущего уровня игрока в отдельной таблице progress
router.post('/progress', async (req, res) => {
  const { playerId, levelId } = req.body;

  if (!playerId || !levelId) {
    return res.status(400).json({ error: 'playerId и levelId обязательны' });
  }

  try {
    await pool.query(`
      INSERT INTO progress (player_id, current_level)
      VALUES ($1, $2)
      ON CONFLICT (player_id)
      DO UPDATE SET current_level = $2, updated_at = CURRENT_TIMESTAMP
    `, [playerId, levelId]);

    res.status(200).json({ message: 'Текущий уровень сохранён' });
  } catch (err) {
    console.error('Ошибка при сохранении текущего уровня:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение текущего уровня игрока
router.get('/:id/progress', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT current_level FROM progress WHERE player_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Прогресс не найден' });
    }

    res.json({ currentLevel: result.rows[0].current_level });
  } catch (err) {
    console.error('Ошибка при получении текущего уровня:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Транзакционное обновление массива прогресса и текущего уровня
router.post('/:id/update-progress', async (req, res) => {
  const { id } = req.params;
  const { levelId } = req.body;

  if (!levelId) {
    return res.status(400).json({ error: 'levelId обязателен' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE players
      SET progress = ARRAY(
        SELECT DISTINCT unnest(COALESCE(progress, '{}') || $1::text[])
      )
      WHERE id = $2
    `, [[levelId.toString()], id]);

    await client.query(`
      INSERT INTO progress (player_id, current_level)
      VALUES ($1, $2)
      ON CONFLICT (player_id)
      DO UPDATE SET current_level = $2, updated_at = CURRENT_TIMESTAMP
    `, [id, levelId]);

    await client.query('COMMIT');
    res.status(200).json({ message: 'Прогресс обновлён' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка при обновлении прогресса:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// Обновление очков (coins), жизней и last_life_update
router.post('/:id/update', async (req, res) => {
  const { id } = req.params;
  const { coins, lives, last_life_update } = req.body;

  if (coins === undefined && lives === undefined && last_life_update === undefined) {
    return res.status(400).json({ error: 'Нужно передать coins, lives или last_life_update' });
  }

  try {
    const fields = [];
    const values = [];
    let index = 1;

    if (coins !== undefined) {
      fields.push(`coins = $${index++}`);
      values.push(coins);
    }

    if (lives !== undefined) {
      fields.push(`lives = $${index++}`);
      values.push(lives);
    }

    if (last_life_update !== undefined) {
      fields.push(`last_life_update = $${index++}`);
      values.push(last_life_update);
    }

    values.push(id);

    const query = `UPDATE players SET ${fields.join(', ')} WHERE id = $${index}`;
    await pool.query(query, values);

    res.status(200).json({ message: 'Данные обновлены' });
  } catch (err) {
    console.error('Ошибка при обновлении данных:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение очков (coins), жизней и last_life_update
router.get('/:id/status', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT coins, lives, last_life_update FROM players WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка при получении статуса:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Восстановление жизней (каждые 15 минут)
router.post('/:id/refresh-lives', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT lives, last_life_update FROM players WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    let { lives, last_life_update } = result.rows[0];

    const now = new Date();
    const lastUpdate = last_life_update ? new Date(last_life_update) : now;

    const minutesPassed = Math.floor((now - lastUpdate) / 1000 / 60);
    let livesToRestore = 0;
    let newLastUpdate = lastUpdate;

    if (minutesPassed >= 15 && lives < 5) {
      livesToRestore = Math.min(Math.floor(minutesPassed / 15), 5 - lives);
      newLastUpdate = new Date(lastUpdate.getTime() + livesToRestore * 15 * 60 * 1000);
      lives += livesToRestore;

      await pool.query(
        'UPDATE players SET lives = $1, last_life_update = $2 WHERE id = $3',
        [lives, newLastUpdate, id]
      );
    } else if (minutesPassed >= 15 && lives >= 5) {
      // Обновляем только last_life_update, чтобы сбросить ожидание
      const missedLives = Math.floor(minutesPassed / 15);
      newLastUpdate = new Date(lastUpdate.getTime() + missedLives * 15 * 60 * 1000);

      await pool.query(
        'UPDATE players SET last_life_update = $1 WHERE id = $2',
        [newLastUpdate, id]
      );
    }

    const minutesToNextLife =
      lives >= 5 ? null : 15 - ((now - newLastUpdate) / 1000 / 60).floor();

    res.json({
      lives,
      restored: livesToRestore,
      minutesToNextLife,
      message: livesToRestore > 0
        ? `Восстановлено ${livesToRestore} жизней`
        : 'Жизни не восстановлены',
    });
  } catch (err) {
    console.error('Ошибка при восстановлении жизней:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Уменьшить жизни на 1 (если больше 0)
router.post('/:id/decrement-lives', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'UPDATE players SET lives = GREATEST(lives - 1, 0), last_life_update = COALESCE(last_life_update, NOW()) WHERE id = $1 RETURNING lives',
      [id]
    );

    res.json({ lives: result.rows[0].lives });
  } catch (err) {
    console.error('Ошибка при уменьшении жизней:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;