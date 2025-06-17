const express = require('express');
const levelsRouter = require('./routes/levels');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Создание data/levels.json, если не существует (Railway fix)
const dataPath = path.join(__dirname, 'data');
const levelsFile = path.join(dataPath, 'levels.json');

if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath);
}

if (!fs.existsSync(levelsFile)) {
  fs.writeFileSync(levelsFile, '[]', 'utf-8');
}

app.use(express.json());
app.use('/levels', levelsRouter);

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
