// scripts/batchSummarizeNews.js
require('dotenv').config();
const pool = require('../../config/db');
const { 
  geminiSummary, 
  generateSummaryPrompt, 
  generateHeadlinePrompt 
} = require('../services/generateNewsSummaryService');

/**
 * 특정 뉴스의 한줄 요약 생성
 * @param {Object} row - 뉴스 데이터
 * @returns {Promise<string>} - 한줄 요약
 */
async function generateHeadline(row) {
  const prompt = generateHeadlinePrompt(row.category, row.representative);
  return await geminiSummary(prompt, row.content);
}

/**
 * 특정 뉴스의 level별 요약 생성
 * @param {Object} row - 뉴스 데이터
 * @param {string} level - 요약 수준 ('초급', '중급', '고급')
 * @returns {Promise<string>} - level별 요약
 */
async function generateLevelSummary(row, level) {
  const prompt = generateSummaryPrompt(level, row.category, row.representative);
  return await geminiSummary(prompt, row.content);
}

/**
 * 모든 요약 수준에 대해 요약 생성 및 저장
 * @param {Object} row - 뉴스 데이터
 * @returns {Promise<void>}
 */
async function summarizeNewsWithAllLevels(row) {
  try {
    // 1. 한줄 요약 생성 (모든 level에 공통으로 사용)
    console.log(`🔍 뉴스 ${row.id} 한줄 요약 생성 중...`);
    const headline = await generateHeadline(row);
    
    // 2. 각 level별 요약 생성 및 저장
    const levels = ['초급', '중급', '고급'];
    
    for (const level of levels) {
      console.log(`🔍 뉴스 ${row.id} ${level} 요약 생성 중...`);
      
      // 해당 level의 요약이 이미 있는지 확인
      const checkQuery = `
        SELECT 1 FROM news_summary 
        WHERE news_id = $1 AND level = $2
      `;
      const checkResult = await pool.query(checkQuery, [row.id, level]);
      
      // 이미 있으면 건너뛰기 (선택사항)
      if (checkResult.rows.length > 0) {
        console.log(`✅ 뉴스 ${row.id} ${level} 요약 이미 존재함`);
        continue;
      }
      
      // level별 요약 생성
      const summary = await generateLevelSummary(row, level);
      
      // DB에 저장
      await pool.query(
        `INSERT INTO news_summary (news_id, level, headline, summary, background_knowledge)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (news_id, level) DO UPDATE
         SET headline = $3, summary = $4, background_knowledge = $5`,
        [row.id, level, headline, summary, '']
      );
      
      console.log(`✅ 뉴스 ${row.id} ${level} 요약 완료`);
    }
    
    console.log(`🎉 뉴스 ${row.id} 모든 요약 완료`);
  } catch (e) {
    console.error(`❌ 요약 실패: 뉴스 ${row.id}`, e.message);
  }
}

/**
 * 아직 요약이 없는 뉴스 찾아서 요약 생성
 */
async function summarizeAllNews() {
  try {
    // 아직 요약이 없는 뉴스만 조회 (어느 level이든 하나라도 없으면)
    const query = `
      SELECT DISTINCT nr.id, nr.title, nr.content, nc.category, nc.representative
      FROM news_raw nr
      LEFT JOIN news_classification nc ON nr.id = nc.news_id
      WHERE nr.id NOT IN (
        SELECT news_id 
        FROM news_summary 
        GROUP BY news_id 
        HAVING COUNT(level) = 3
      )
      ORDER BY nr.id
      LIMIT 10
    `;
    
    const { rows } = await pool.query(query);
    console.log(`🔍 요약할 뉴스 개수: ${rows.length}`);
    
    // 각 뉴스에 대해 모든 level 요약 생성
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
