// utils/extractNewsTerm.js

const pool = require('../../config/db');

// 1. 뉴스 기사에서 경제 용어 추출 (NER 또는 키워드 매칭)
async function extractFinancialTerms(newsContent) {
    // 간단한 구현: 미리 정의된 용어 목록과 매칭
    // 실제로는 NER 모델 사용 권장
    const allTerms = await pool.query('SELECT term FROM financial_terms');
    const termList = allTerms.rows.map(row => row.term);
    
    // 추출된 용어 목록 (실제 NER 구현 필요)
    const extractedTerms = [];
    
    for (const term of termList) {
      if (newsContent.includes(term)) {
        extractedTerms.push(term);
      }
    }
    
    return extractedTerms;
  }
  
  // 2. 추출된 용어가 DB에 있는지 확인
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
  
  module.exports = {
    extractFinancialTerms,
    checkTermsInDatabase
  };