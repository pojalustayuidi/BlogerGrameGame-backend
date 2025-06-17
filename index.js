const express = require('express');
const levelsRouter = require('./routes/levels');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/levels', levelsRouter);
app.get('/debug', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dirPath = path.join(__dirname, 'data/levels');
  const files = fs.readdirSync(dirPath);
  res.json({ files });
})

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
