// service/generateNewsTerm.js

const { extractFinancialTerms, checkTermsInDatabase } = require('../utils/extractNewsTerm');
const { crawlBokDictionary, simplifyExplanation, saveNewTerm } = require('../utils/addNewTerm');

// 메인 함수: 뉴스 기사에서 용어 추출 및 처리
async function processNewsTerms(newsContent) {
    // 1. 용어 추출
    const extractedTerms = await extractFinancialTerms(newsContent);
    
    // 2. DB에 있는 용어와 없는 용어 구분
    const { knownTerms, unknownTerms } = await checkTermsInDatabase(extractedTerms);
    
    // 3. 없는 용어는 한국은행 사전에서 검색하여 저장
    for (const term of unknownTerms) {
      const originalExplanation = await crawlBokDictionary(term);
      
      if (originalExplanation) {
        // 4. 설명을 중학생 수준으로 단순화
        const simplifiedExplanation = await simplifyExplanation(originalExplanation);
        
        // 5. DB에 저장
        await saveNewTerm(term, simplifiedExplanation);
      }
    }
    
    // 6. 모든 용어 정보 반환 (이미 있던 것 + 새로 추가된 것)
    return await checkTermsInDatabase(extractedTerms);
  }
  
  module.exports = {
    processNewsTerms,
    extractFinancialTerms,
    checkTermsInDatabase
  };