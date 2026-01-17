// src/services/saveBackground.js
const pool = require('../../config/db');
const dayjs = require('dayjs');
const {
  generateBackground,
} = require('./generateBackground');

/**
 * category에 따라 적절한 테이블에 background 저장
 * @param {Object} news - 뉴스 정보 (id, category, representative, level, content)
 */
async function generateAndSaveBackground(news) {
  const { id, category, representative, level, content } = news;

  // 중급 레벨만 저장 (HTML 기반)
  if (level !== '중급') return;

  const backgroundHTML = await generateBackground(category, level, content, representative);
  if (!backgroundHTML) return;

  const today = dayjs().format('YYYY-MM-DD');

  try {
    if (category === '산업군') {
      await pool.query(
        `INSERT INTO industry_issue (industry_name, summary_date, summary_title, summary_detail)
         VALUES ($1, $2, ARRAY[$3], ARRAY[$4])
         ON CONFLICT (industry_name, summary_date) DO NOTHING`,
        [representative, today, '', backgroundHTML]
      );
    } else if (category === '테마') {
      await pool.query(
        `INSERT INTO theme_issue (theme_name, summary_date, summary_title, summary_detail)
         VALUES ($1, $2, ARRAY[$3], ARRAY[$4])
         ON CONFLICT (theme_name, summary_date) DO NOTHING`,
        [representative, today, '', backgroundHTML]
      );
    } else if (category === '전반적') {
      await pool.query(
        `INSERT INTO macro_issue (summary_date, representative, summary_title, summary_detail, related_indicators, market_impact)
         VALUES ($1, $2, ARRAY[$3], ARRAY[$4], ARRAY['-'], ARRAY['-'])
         ON CONFLICT (summary_date, representative) DO NOTHING`,
        [today, representative, '', backgroundHTML]
      );
    } else if (category === '개별주') {
      const stockCodeResult = await pool.query(
        `SELECT stock_code, stock_name FROM tmp_stock WHERE stock_name = $1 LIMIT 1`,
        [representative]
      );
      if (stockCodeResult.rows.length === 0) return;
      const stock = stockCodeResult.rows[0];

      await pool.query(
        `INSERT INTO stock_issue (stock_code, stock_name, summary_date, summary_title, summary_detail, related_indicators, price_impact)
         VALUES ($1, $2, $3, ARRAY[$4], ARRAY[$5], ARRAY['-'], ARRAY['-'])
         ON CONFLICT (stock_code, summary_date) DO NOTHING`,
        [stock.stock_code, stock.stock_name, today, '', backgroundHTML]
      );
    }
  } catch (err) {
    console.error(`❌ background 저장 실패: 뉴스 ${id}`, err.message);
  }
}

module.exports = { generateAndSaveBackground };
