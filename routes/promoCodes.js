const express = require('express');
const router = express.Router();
const pool = require('../db');

// Проверка и активация промокода
router.post('/redeem', async (req, res) => {
    console.log('Получен запрос на /redeem:', req.body);
  const { playerId, code } = req.body;

  if (!playerId || !code) {
    return res.status(400).json({ error: 'playerId и code обязательны' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Проверяем существует ли промокод и не истёк ли
    const promoRes = await client.query(
      'SELECT * FROM promo_codes WHERE code = $1',
      [code]
    );
    if (promoRes.rows.length === 0) {
      throw new Error('Промокод не найден');
    }
    const promo = promoRes.rows[0];

    if (promo.expires_at && new Date() > promo.expires_at) {
      throw new Error('Промокод истёк');
    }

    if (promo.used_count >= promo.max_uses) {
      throw new Error('Промокод уже использован максимальное количество раз');
    }

    // Проверяем, не использовал ли игрок этот промокод
    const usedCheck = await client.query(
      'SELECT * FROM promo_code_uses WHERE player_id = $1 AND code = $2',
      [playerId, code]
    );
    if (usedCheck.rows.length > 0) {
      throw new Error('Вы уже использовали этот промокод');
    }

    // Обновляем количество использований промокода
    await client.query(
      'UPDATE promo_codes SET used_count = used_count + 1 WHERE code = $1',
      [code]
    );

    // Добавляем запись об использовании игроком
    await client.query(
      'INSERT INTO promo_code_uses (player_id, code) VALUES ($1, $2)',
      [playerId, code]
    );

    // Начисляем награду игроку (монеты, подсказки, жизни)
    const playerRes = await client.query(
      'SELECT coins, hints, lives FROM players WHERE id = $1',
      [playerId]
    );
    if (playerRes.rows.length === 0) {
      throw new Error('Игрок не найден');
    }

    const newCoins = (playerRes.rows[0].coins || 0) + (promo.reward_coins || 0);
    const newHints = (playerRes.rows[0].hints || 0) + (promo.reward_hints || 0);
    const newLives = (playerRes.rows[0].lives || 0) + (promo.reward_lives || 0);

    await client.query(
      'UPDATE players SET coins = $1, hints = $2, lives = $3 WHERE id = $4',
      [newCoins, newHints, newLives, playerId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Промокод активирован. Получено: ${promo.reward_coins || 0} монет, ${promo.reward_hints || 0} подсказок, ${promo.reward_lives || 0} жизней`,
      reward_coins: promo.reward_coins || 0,
      reward_hints: promo.reward_hints || 0,
      reward_lives: promo.reward_lives || 0
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка при активации промокода:', err);
    res.status(400).json({ error: err.message || 'Ошибка при активации промокода' });
  } finally {
    client.release();
  }
});

module.exports = router;