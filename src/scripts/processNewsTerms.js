// 예시: src/scripts/processNewsTerm.js
const pool = require('../../config/db');
const { processNewsTerm } = require('../utils/extractAndSaveNewsTerm');

(async () => {
  const result = await pool.query(
    'SELECT id, content FROM news_raw ORDER BY id DESC LIMIT 5' // 테스트용 5개만
  );
  for (const row of result.rows) {
    await processNewsTerm(row.id, row.content);
  }
})();
