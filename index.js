const express = require('express');
const app = express();
const levelsRouter = require('./routes/levels');

app.use(express.json());
app.use('/levels', levelsRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
