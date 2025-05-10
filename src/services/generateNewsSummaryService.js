// services/generateNewsSummaryService.js
// npm install @google/generative-ai

require('dotenv').config();
const { genAI, model } = require('../../config/gemini');

/**
 * Gemini로 뉴스 요약 생성
 * @param {string} prompt - 프롬프트(요약/배경지식 등)
 * @param {string} content - 뉴스 본문
 * @returns {Promise<string>} - 요약 결과
 */
async function geminiSummary(prompt, content) {
  const fullPrompt = `${prompt.trim()}\n\n${content.trim().slice(0, 3000)}`;
  try {
    const result = await model.generateContent(fullPrompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Gemini API 호출 오류:", error.message);
    throw error;
  }
}

/**
 * 한 줄 요약 프롬프트 생성
 * @param {string} category - 뉴스 카테고리
 * @param {string} representative - 대표 항목
 * @returns {string} - 한 줄 요약 프롬프트
 */
function generateHeadlinePrompt(category, representative) {
  let repText = (category !== '전반적' && representative)
    ? `"${representative}"와 관련된 ${category} 뉴스야.`
    : `${category} 분류에 해당하는 뉴스야.`;

  return `이 뉴스는 ${repText}
한 문장 또는 두 문장으로 요점을 명확하게 정리해줘.
사람들이 제목으로만 봐도 내용을 이해할 수 있게 써줘.`;
}

/**
 * 수준별 요약 프롬프트 생성
 * @param {string} level - 요약 수준 ('초급', '중급', '고급')
 * @param {string} category - 뉴스 카테고리
 * @param {string} representative - 대표 항목
 * @returns {string} - 수준별 요약 프롬프트
 */
function generateSummaryPrompt(level, category, representative) {
  let repText = (category !== '전반적' && representative)
    ? `"${representative}"와 관련된 ${category} 뉴스야.`
    : `${category} 분류에 해당하는 뉴스야.`;

  if (level === '초급') {
    return `이 뉴스는 경제나 주식에 관심이 없는 중학생이 이해할 수 있도록 쉽게 요약해줘.
${repText}
- 전문 용어는 피하고 쉬운 문장으로 설명해줘
- 이야기 하듯이 쉽게 써줘.
- 문장은 3~5개로 간단하게 써줘.`;
  }
  if (level === '중급') {
    return `이 뉴스는 일반 성인 독자를 대상으로 요약해줘.
${repText}
- 전문 용어는 사용해도 되지만, 간단한 해설을 붙여줘.
- 문장은 4~6개 정도.`;
  }
  if (level === '고급') {
    return `이 뉴스는 주식 투자에 익숙한 사람을 대상으로 요약해줘.
${repText}
- 실적, 전략, 배경 설명, 투자 시사점을 담아줘.
- 문장은 5~7개 정도로 정리.`;
  }
  return "요약 수준이 정의되지 않았습니다.";
}

module.exports = { 
  geminiSummary, 
  generateSummaryPrompt,
  generateHeadlinePrompt
};
