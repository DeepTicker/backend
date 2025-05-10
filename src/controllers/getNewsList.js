// src/controllers/newsController.js

const pool = require("../db");

// GET /api/news/main?limit=5
async function getMainNews(req, res) {
  const limit = parseInt(req.query.limit) || 5;
  try {
    //전체 개수 쿼리
    const totalQuery = `SELECT COUNT(*) FROM news_raw`;
    const { rows: countRows } = await pool.query(totalQuery);
    const totalNews = parseInt(countRows[0].count);

    // 뉴스 목록 쿼리리
    const query = `
      SELECT nr.id, nr.title, nc.category, nc.representative
      FROM news_raw nr
      JOIN news_classification nc ON nr.id = nc.news_id
      ORDER BY nr.date DESC NULLS LAST, nr.id DESC
      LIMIT $1
    `;

    const { rows } = await pool.query(query, [limit]);
    res.json(rows);
  } catch (err) {
    console.error("❌ 메인 뉴스 조회 실패:", err);
    res.status(500).json({ error: "서버 오류" });
  }
}

// GET /api/news/list?page=1&size=20
async function getNewsList(req, res) {
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 20;
  const offset = (page - 1) * size;

  try {
    const query = `
      SELECT nr.id, nr.title, nc.category, nc.representative
      FROM news_raw nr
      JOIN news_classification nc ON nr.id = nc.news_id
      ORDER BY nr.date DESC NULLS LAST, nr.id DESC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(query, [size, offset]);

    // 전체 뉴스 개수를 구하는 쿼리
    const countQuery = `SELECT COUNT(*) FROM news_raw nr`;
    const { rows: countRows } = await pool.query(countQuery);
    const totalNews = parseInt(countRows[0].count);

    // 뉴스 목록과 총 개수를 응답
    res.json({ news: rows, total: totalNews });
  } catch (err) {
    console.error("❌ 뉴스 목록 조회 실패:", err);
    res.status(500).json({ error: "서버 오류" });
  }
}


module.exports = {
  getMainNews,
  getNewsList,
};