const pool = require('../../config/db');
const { extractFinancialTerms, checkTermsInDatabase } = require('../utils/extractNewsTerm');
const { crawlBokDictionary, simplifyExplanation, saveNewTerm, generateExplanationWithLLM, classifyTerm } = require('../utils/addNewTerm');

async function processNewsTerms(newsContent) {
  const extractedTerms = await extractFinancialTerms(newsContent);
  const { knownTerms, unknownTerms } = await checkTermsInDatabase(extractedTerms);

  for (const term of unknownTerms) {
    let original = await crawlBokDictionary(term);
    if (!original) original = await generateExplanationWithLLM(term);
    if (!original) continue;

    const simplified = await simplifyExplanation(original);
    const category = classifyTerm(term, original);
    await saveNewTerm(term, simplified, original, category);
  }

  return await checkTermsInDatabase(extractedTerms);
}

// news_raw 테이블에서 뉴스 불러와 전체 처리
async function processAllNewsFromRawTable() {
  const result = await pool.query('SELECT id, content FROM news_raw');
  for (const row of result.rows) {
    console.log(`\n📰 Processing news ID ${row.id}...`);
    const terms = await processNewsTerms(row.content);
    console.dir({ id: row.id, ...terms }, { depth: null });
  }
}

module.exports = {
  processNewsTerms,
  processAllNewsFromRawTable
};