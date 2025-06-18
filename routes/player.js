const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const playersFile = path.join(__dirname, '../data/players.json');

// Регистрация нового игрока
router.post('/register', (req, res) => {
  const playerId = uuidv4();

  const playerData = {
    id: playerId,
    points: 0,
    lives: 5,
    progress: [],
  };

  let players = [];
  if (fs.existsSync(playersFile)) {
    const raw = fs.readFileSync(playersFile);
    players = JSON.parse(raw);
  }

  players.push(playerData);
  fs.writeFileSync(playersFile, JSON.stringify(players, null, 2));

  res.status(201).json({ playerId });
});

module.exports = router; // ⚠️ обязательно должен экспортироваться router
