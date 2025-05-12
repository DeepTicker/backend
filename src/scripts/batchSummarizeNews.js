// scripts/batchSummarizeNews.js
require('dotenv').config();
const pool = require('../../config/db');
const { 
  geminiSummary, 
  generateSummaryPrompt, 
  generateHeadlinePrompt 
} = require('../services/generateNewsSummaryService');
const { generateAndSaveBackground } = require('../services/saveBackground');

/**
 * 특정 뉴스의 한줄 요약 생성
 * @param {Object} row - 뉴스 데이터
 * @returns {Promise<string>} - 한줄 요약
 */
async function generateHeadline(row) {
  const prompt = generateHeadlinePrompt(row.classifications.map(c => c.category), row.classifications.map(c => c.representative));
  return await geminiSummary(prompt, row.content);
}

/**
 * 특정 뉴스의 level별 요약 생성
 * @param {Object} row - 뉴스 데이터
 * @param {string} level - 요약 수준 ('초급', '중급', '고급')
 * @returns {Promise<string>} - level별 요약
 */
async function generateLevelSummary(row, level) {
  const prompt = generateSummaryPrompt(level, row.classifications.map(c => c.category), row.classifications.map(c => c.representative));
  return await geminiSummary(prompt, row.content);
}

/**
 * 모든 요약 수준에 대해 요약 생성 및 저장
 * @param {Object} row - 뉴스 데이터
 * @returns {Promise<void>}
 */
async function summarizeNewsWithAllLevels(row) {
  try {
    // 1. 한줄 요약 생성
    console.log(`🔍 뉴스 ${row.id} 한줄 요약 생성 중...`);
    const headline = await generateHeadline(row);

    // 2. 각 level별 요약
    const levels = ['초급', '중급', '고급'];

    for (const level of levels) {
      console.log(`🔍 뉴스 ${row.id} ${level} 요약 생성 중...`);

      const checkQuery = `
        SELECT 1 FROM news_summary
        WHERE news_id = $1 AND level = $2
      `;
      const checkResult = await pool.query(checkQuery, [row.id, level]);
      if (checkResult.rows.length > 0) {
        console.log(`✅ 뉴스 ${row.id} ${level} 요약 이미 존재함`);
        continue;
      }

      const summary = await generateLevelSummary(row, level);

      await pool.query(
        `INSERT INTO news_summary (news_id, level, headline, summary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (news_id, level) DO UPDATE
         SET headline = $3, summary = $4`,
        [row.id, level, headline, summary]
      );

      console.log(`✅ 뉴스 ${row.id} ${level} 요약 완료`);

      // ✅ 중급 요약 이후 배경지식 저장
      if (level === '중급') {
        for (const cls of row.classifications) {
          await generateAndSaveBackground({
            id: row.id,
            category: cls.category,
            representative: cls.representative,
            level,
            content: row.content
          });
        }
      }
    }

    console.log(`🎉 뉴스 ${row.id} 모든 요약 완료`);
  } catch (e) {
    console.error(`❌ 요약 실패: 뉴스 ${row.id}`, e.message);
  }
}

/**
 * 요약할 뉴스 조회 및 실행
 */
async function summarizeAllNews() {
  try {
    const query = `
      SELECT nr.id, nr.content,
             json_agg(json_build_object('category', nc.category, 'representative', nc.representative)) AS classifications
      FROM news_raw nr
      JOIN news_classification nc ON nr.id = nc.news_id
      WHERE nr.id NOT IN (
        SELECT news_id FROM news_summary GROUP BY news_id HAVING COUNT(level) = 3
      )
      GROUP BY nr.id, nr.content
      ORDER BY nr.id
      LIMIT 10
    `;

    const { rows } = await pool.query(query);
    console.log(`🔍 요약할 뉴스 개수: ${rows.length}`);

    for (const row of rows) {
      await summarizeNewsWithAllLevels(row);
    }

    console.log("🎉 모든 뉴스 요약 완료");
  } catch (err) {
    console.error("❌ 요약 중 오류:", err.message);
  } finally {
    await pool.end();
    process.exit();
  }
}

// 실행
summarizeAllNews();
