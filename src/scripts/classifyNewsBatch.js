// src/scripts/classifyNewsBatch.js
require("dotenv").config();
const dayjs = require("dayjs");

const {
  classifyArticle,
  getAllStockNames,
} = require("../utils/classifyNews");

const pool = require('../../config/db');

(async () => {
  try {
    console.log("🚀 뉴스 분류 시작");

    const companyList = await getAllStockNames();

    // news_raw 중 아직 news_classification에 없는 것만 가져오기
    const query = `
      SELECT nr.id, nr.title, nr.content
      FROM news_raw nr
      LEFT JOIN news_classification nc ON nr.id = nc.news_id
      WHERE nc.news_id IS NULL
      ORDER BY nr.id
    `;
    const { rows } = await pool.query(query);

    console.log(`🔍 분류할 뉴스 개수: ${rows.length}`);

    for (const row of rows) {
      const { id, title, content } = row;
      const { category, representative } = await classifyArticle(title, content, companyList);

      const insertQuery = `
        INSERT INTO news_classification (news_id, category, representative, classified_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (news_id) DO NOTHING
      `;
      await pool.query(insertQuery, [
        id,
        category,
        representative,
        dayjs().toISOString(),
      ]);

      console.log(`✅ 분류 완료: [${id}] ${category} | 대표: ${representative}`);
    }

    console.log("🎉 전체 뉴스 분류 완료");
  } catch (err) {
    console.error("❌ 분류 중 오류:", err.message);
  } finally {
    await pool.end();
  }
})();
