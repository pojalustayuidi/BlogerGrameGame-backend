const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://game_blogergramm_user:YbRO63X3x1rb3lXijJc4XEnGueMJImgO@dpg-d19h4kili9vc7380pvc0-a/game_blogergramm',
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = pool;
