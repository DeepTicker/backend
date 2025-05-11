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
 * @param {Array<{category: string, representative: string}>} classifications - 뉴스 분류 정보 배열
 * @returns {string} - 한 줄 요약 프롬프트
 */
function generateHeadlinePrompt(classifications) {
  const categoryDescriptions = classifications.map(({ category, representative }) => {
    if (category === '그 외') return '그 외 분류에 해당하는 뉴스';
    return `"${representative}"와 관련된 ${category} 뉴스`;
  });

  const description = categoryDescriptions.length > 1
    ? categoryDescriptions.slice(0, -1).join('이면서 ') + '이기도 한 뉴스'
    : categoryDescriptions[0];

  return `이 뉴스는 ${description}입니다.
한 문장 또는 두 문장으로 요점을 명확하게 정리해줘.
사람들이 제목으로만 봐도 내용을 이해할 수 있게 써줘.`;
}

/**
 * 수준별 요약 프롬프트 생성
 * @param {string} level - 요약 수준 ('초급', '중급', '고급')
 * @param {Array<{category: string, representative: string}>} classifications - 뉴스 분류 정보 배열
 * @returns {string} - 수준별 요약 프롬프트
 */
function generateSummaryPrompt(level, classifications) {
  const categoryDescriptions = classifications.map(({ category, representative }) => {
    if (category === '그 외') return '그 외 분류에 해당하는 뉴스';
    return `"${representative}"와 관련된 ${category} 뉴스`;
  });

  const description = categoryDescriptions.length > 1
    ? categoryDescriptions.slice(0, -1).join('이면서 ') + '이기도 한 뉴스'
    : categoryDescriptions[0];

  if (level === '초급') {
    return `이 뉴스는 경제나 주식에 관심이 없는 중학생이 이해할 수 있도록 쉽게 요약해줘.
이 뉴스는 ${description}입니다.
- 전문 용어는 피하고 쉬운 문장으로 설명해줘
- 이야기 하듯이 쉽게 써줘.
- 문장은 3~5개로 간단하게 써줘.`;
  }
  if (level === '중급') {
    return `이 뉴스는 일반 성인 독자를 대상으로 요약해줘.
이 뉴스는 ${description}입니다.
- 전문 용어는 사용해도 되지만, 간단한 해설을 붙여줘.
- 문장은 4~6개 정도.`;
  }
  if (level === '고급') {
    return `이 뉴스는 주식 투자에 익숙한 사람을 대상으로 요약해줘.
이 뉴스는 ${description}입니다.
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
