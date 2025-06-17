const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/levels', (req, res) => {
  const data = fs.readFileSync(path.join(__dirname, 'data', 'levels.json'), 'utf-8');
  const levels = JSON.parse(data);
  res.json(levels);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
