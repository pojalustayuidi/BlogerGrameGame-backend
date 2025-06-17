const express = require('express');
const levelsRouter = require('./routes/levels');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/levels', levelsRouter);

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
