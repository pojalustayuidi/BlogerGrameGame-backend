const express = require('express');
const levelsRouter = require('./routes/levels'); // ✅ путь должен быть точным!

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 🔥 Ошибка здесь, если levelsRouter не функция:
app.use('/levels', levelsRouter);

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});

