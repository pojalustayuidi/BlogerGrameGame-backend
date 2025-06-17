const express = require('express');
const router = express.Router();

const levels = require('../data/levels.json');

router.get('/', (req, res) => {
  res.json(levels);
});

module.exports = router;
