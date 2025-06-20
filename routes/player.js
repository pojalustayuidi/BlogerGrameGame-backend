const express = require('express');
const router = express.Router();
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// ✅ Регистрация игрока
router.post('/register', async (req, res) => {
  const id = uuidv4();
  try {
    await pool.query(
  'INSERT INTO players (id, created_at, coins, lives) VALUES ($1, NOW(), $2, $3)',
  [id, 0, 5]
);

    res.status(201).json({ playerId: id });
  } catch (err) {
    console.error('Ошибка при регистрации:', err);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
});

// ✅ Получение данных игрока
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

// ✅ Обновление массива progress (список пройденных уровней)
router.post('/:id/progress', async (req, res) => {
  const { id } = req.params;
  const { levelId } = req.body;

  if (!levelId) {
    return res.status(400).json({ error: 'levelId обязателен' });
  }

  try {
    await pool.query(`
      UPDATE players
      SET progress = ARRAY(SELECT DISTINCT unnest(progress || $1::text[]))
      WHERE id = $2
    `, [[levelId.toString()], id]);

    res.status(200).json({ message: 'Прогресс обновлён' });
  } catch (err) {
    console.error('Ошибка при обновлении массива progress:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✅ Сохранение текущего уровня игрока в отдельной таблице `progress`
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

// ✅ Получение текущего уровня игрока
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
router.post('/:id/update', async (req, res) => {
  const { id } = req.params;
  const { points, lives } = req.body;

  if (points === undefined && lives === undefined) {
    return res.status(400).json({ error: 'Нужно передать points и/или lives' });
  }

  try {
    const fields = [];
    const values = [];
    let index = 1;

    if (points !== undefined) {
      fields.push(`points = $${index++}`);
      values.push(points);
    }

    if (lives !== undefined) {
      fields.push(`lives = $${index++}`);
      values.push(lives);
    }

    values.push(id); // последний аргумент — id

    const query = `UPDATE players SET ${fields.join(', ')} WHERE id = $${index}`;
    await pool.query(query, values);

    res.status(200).json({ message: 'Данные обновлены' });
  } catch (err) {
    console.error('Ошибка при обновлении очков/жизней:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✅ Получение очков и жизней игрока
router.get('/:id/status', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT points, lives FROM players WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка при получении очков/жизней:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
