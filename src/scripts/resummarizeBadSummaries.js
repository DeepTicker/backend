// src/scripts/resummarizeBadSummaries.js

require('dotenv').config();
const pool = require('../../config/db');
const { geminiSummary, generateSummaryPrompt } = require('../services/generateNewsSummaryService');

const BLEU_THRESHOLDS = {
  '초급': 0,
  '중급': 0.001,
  '고급': 0.001
};

async function resummarizeBadSummaries() {
  try {
    const query = `
      SELECT ns.news_id, ns.level, ns.summary, ns.rouge1, ns.bleu,
             nr.content,
             json_agg(json_build_object('category', nc.category, 'representative', nc.representative)) AS classifications
      FROM news_summary ns
      JOIN news_raw nr ON ns.news_id = nr.id
      JOIN news_classification nc ON nc.news_id = nr.id
      WHERE 
        (ns.rouge1 < 0.1)
        OR (ns.bleu IS NOT NULL AND (
              (ns.level = '중급' AND ns.bleu < 0.001) OR
              (ns.level = '고급' AND ns.bleu < 0.001)
        ))
        OR (char_length(ns.summary) < 40)
        OR (
          SELECT MAX(freq)::FLOAT / GREATEST(char_length(ns.summary), 1)
          FROM (
            SELECT COUNT(*) AS freq
            FROM unnest(string_to_array(ns.summary, ' ')) w
            GROUP BY w
            ORDER BY COUNT(*) DESC
            LIMIT 1
          ) sub
        ) > 0.3
      GROUP BY ns.news_id, ns.level, ns.summary, ns.rouge1, ns.bleu, nr.content
      LIMIT 20
    `;

    const { rows } = await pool.query(query);

    console.log(`🔁 재요약 대상: ${rows.length}건`);

    for (const row of rows) {
      const { news_id, level, content, classifications } = row;
      const categories = classifications.map(c => c.category);
      const representatives = classifications.map(c => c.representative);

      const prompt = generateSummaryPrompt(level, categories, representatives);
      const summary = await geminiSummary(prompt, content);

      await pool.query(`
        UPDATE news_summary
        SET summary = $1,
            rouge1 = NULL, rougeL = NULL, bleu = NULL,
            generated_at = CURRENT_TIMESTAMP
        WHERE news_id = $2 AND level = $3
      `, [summary, news_id, level]);

      console.log(`✅ 뉴스 ${news_id} [${level}] 재요약 완료`);
    }

    console.log("🎯 모든 재요약 완료. 평가 스크립트를 다시 실행하세요.");

  } catch (err) {
    console.error("❌ 재요약 중 오류:", err.message);
  } finally {
    await pool.end();
  }
}

resummarizeBadSummaries();
