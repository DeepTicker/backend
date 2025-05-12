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
 * 카테고리/대표 키워드 기반 프롬프트 생성 (한줄 요약용)
 * @param {string|string[]} category 
 * @param {string|string[]} representative 
 * @returns {string}
 */
function generateHeadlinePrompt(category, representative) {
  const pairs = Array.isArray(category)
    ? category.map((cat, i) => `${cat} - ${representative?.[i] ?? ''}`)
    : [`${category} - ${representative}`];

  return `이 뉴스는 다음 분류에 속합니다: ${pairs.join(', ')}. 이 뉴스의 핵심 내용을 한 문장으로 요약해 주세요.`;
}

/**
 * 카테고리/대표 키워드 기반 프롬프트 생성 (수준별 요약용)
 * @param {string} level
 * @param {string|string[]} category
 * @param {string|string[]} representative
 * @returns {string}
 */
function generateSummaryPrompt(level, category, representative) {
  const pairs = Array.isArray(category)
    ? category.map((cat, i) => `${cat} - ${representative?.[i] ?? ''}`)
    : [`${category} - ${representative}`];

  const joined = pairs.join(', ');

  if (level === '초급') {
    return `이 뉴스는 경제나 주식에 관심이 없는 중학생이 이해할 수 있도록 쉽게 요약해줘.
이 뉴스는 ${joined}와 관련된 내용입니다.
- 전문 용어는 피하고 쉬운 문장으로 설명해줘
- 이야기 하듯이 쉽게 써줘.
- 문장은 3~5개로 간단하게 써줘.`;
  }
  if (level === '중급') {
    return `이 뉴스는 일반 성인 독자를 대상으로 요약해줘.
이 뉴스는 ${joined}와 관련된 내용입니다.
- 전문 용어는 사용해도 되지만, 간단한 해설을 붙여줘.
- 문장은 4~6개 정도.`;
  }
  if (level === '고급') {
    return `이 뉴스는 주식 투자에 익숙한 사람을 대상으로 요약해줘.
이 뉴스는 ${joined}와 관련된 내용입니다.
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
