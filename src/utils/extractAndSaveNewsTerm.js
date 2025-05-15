// src/utils/extractAndSaveNewsTerms.js
const { spawn } = require('child_process');
const pool = require('../../config/db');
const path = require('path');

// 1. 뉴스 기사에서 경제 용어 매칭
async function extractFinancialTerms(newsContent) {
  // 1. financial_terms 테이블에서 모든 용어 가져오기
  const allTerms = await pool.query('SELECT term, explanation FROM financial_terms');
  
  // 2. 본문에 포함된 용어만 필터링
  const matchedTerms = allTerms.rows.filter(term => 
      newsContent.includes(term.term)
  );
  
  return matchedTerms;
}

// 2. 용어가 DB에 있는지 확인
async function checkTermsInDatabase(terms) {
  const knownTerms = [];
  const unknownTerms = [];
  
  for (const term of terms) {
    const result = await pool.query(
      'SELECT * FROM financial_terms WHERE term = $1',
      [term]
    );
    
    if (result.rows.length > 0) {
      knownTerms.push(result.rows[0]);
    } else {
      unknownTerms.push(term);
    }
  }
  
  return { knownTerms, unknownTerms };
}


async function extractTermsFromText(text) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, './ner_extractor.py');
    const py = spawn('python', [scriptPath]);

    let result = '';
    py.stdin.write(text);
    py.stdin.end();

    py.stdout.on('data', (data) => {
      result += data.toString();
    });

    py.stderr.on('data', (err) => {
      console.error('NER stderr:', err.toString());
    });

    py.on('close', (code) => {
      if (code !== 0) return reject(new Error('NER exited with code ' + code));
      try {
        const parsed = JSON.parse(result);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * category 가져오기 (financial_terms 기준)
 */
async function getCategory(term) {
  const result = await pool.query(
    'SELECT category FROM financial_terms WHERE term = $1',
    [term]
  );
  return result.rows[0]?.category || '미분류';
}

/**
 * news_terms에 저장
 */
async function saveTerms(newsId, terms) {
  for (const term of terms) {
    const category = await getCategory(term);
    try {
      await pool.query(
        'INSERT INTO news_terms(news_id, term, category) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
        [newsId, term, category]
      );
      console.log(`✅ ${term} 저장 완료 (카테고리: ${category})`);
    } catch (error) {
      console.error(`❌ ${term} 저장 실패:`, error);
    }
  }
}

/**
 * 통합 실행 함수
 */
async function processNewsTerms(newsContent) {
  // 단순히 본문에 포함된 용어만 반환
  const terms = await extractFinancialTerms(newsContent);
  return { knownTerms: terms, unknownTerms: [] };
}

module.exports = {
  processNewsTerms,
  extractFinancialTerms,
  checkTermsInDatabase,
  extractTermsFromText
};
