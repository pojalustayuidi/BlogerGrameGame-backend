const express = require('express');
const router = express.Router();
const levels = require('../data/levels.json');

// Вернуть все уровни
router.get('/', (req, res) => {
  res.json(levels);
});

// Вернуть один уровень по ID
router.get('/:id', (req, res) => {
  const levelId = parseInt(req.params.id, 10);
  const level = levels.find(l => l.id === levelId);

  if (!level) {
    return res.status(404).json({ error: 'Level not found' });
  }

  res.json(level);
});

router.get('/count/all', (req, res) => {
  res.json({ count: levels.length });
});

module.exports = router;
