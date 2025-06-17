const express = require('express');
const router = express.Router();
const levelController = require('../controllers/levelController');

router.get('/', levelController.getAllLevels);
router.get('/:id', levelController.getLevelById);
router.post('/', levelController.addLevel);

module.exports = router;
