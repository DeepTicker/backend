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
- 문장은 3-5개로 간단하게 써줘.

예시 ) 
삼성전자가 AI에 사용되는 반도체를 많이 만들고 있어요.  
이 반도체는 똑똑한 기계가 잘 작동하도록 도와줘요.  
요즘 이런 기술이 중요해지면서 삼성전자의 매출도 늘었어요.  
그래서 많은 사람들이 삼성전자가 앞으로 더 성장할 거라고 기대하고 있어요.`
;
  }
  if (level === '중급') {
    return `이 뉴스는 일반 성인 독자를 대상으로 요약해줘.
이 뉴스는 ${joined}와 관련된 내용입니다.
- 가장 먼저 구조를 파악하고, 흐름을 알기 쉽게 서술해줘
- 예를 들어, 핵심 배경 → 현재 상황 → 원인 → 전망
- 전문 용어는 사용 가능하지만 간단한 해설을 붙여줘.
- 문장은 5~7개 정도
- 전체 요약은 줄글 형태로 작성해줘

예시 )
최근 생성형 AI와 데이터센터 확산으로 인해 AI 반도체에 대한 수요가 급격히 늘고 있다.  
이러한 흐름 속에서 삼성전자는 고성능 반도체 생산을 확대하며 매출 반등을 이뤄냈다.  
AI 반도체는 인공지능이 빠르게 계산할 수 있도록 도와주는 특수한 반도체다.  
특히, 삼성은 경쟁사보다 높은 기술력을 바탕으로 시장에서 유리한 입지를 확보하고 있다는 평가를 받고 있다.  
전문가들은 하반기에도 수요가 지속될 것으로 보고 있으며, 이는 투자자들의 기대감으로 이어지고 있다.`
;
  }

  if (level === '고급') {
    return `이 뉴스는 주식 투자에 익숙한 사람을 대상으로 요약해줘.
이 뉴스는 ${joined}와 관련된 내용입니다.
- 가장 먼저 구조를 파악하고, 흐름을 자세하게 설명해줘
- 실적, 전략, 배경 설명, 투자 시사점을 담아줘.
- 명확한 흐름 (문제 -> 원인 -> 시사점)을 잡아줘
- 문장은 6-9개 정도로 정리.

예시 줄글 )
AI 반도체 수요 확대로 삼성전자의 반도체 부문 매출이 전년 대비 22% 증가했다. 
데이터센터 및 생성형 AI 모델에 대한 투자가 급증하며 수요를 견인한 것으로 분석된다.
삼성은 고대역폭 메모리(HBM) 및 자체 AI 칩 생산에 집중하고 있으며, 이는 경쟁사와의 기술 격차를 벌리는 전략이다.
다만, 미국과 중국 간 반도체 패권 경쟁은 향후 변수로 작용할 수 있다.
전문가들은 삼성의 대응 전략이 투자 매력도를 높이고 있다고 평가한다.

예시 구조형 )
문제: AI 반도체 수요 급증으로 인한 생산 대응 필요
원인: 생성형 AI 및 클라우드 수요 확대
전략: 삼성은 고대역폭 메모리 및 AI 칩에 집중
시사점: 경쟁력 강화를 통해 투자 매력이 증가함`
;
  }
  return "요약 수준이 정의되지 않았습니다.";
}


module.exports = { 
  geminiSummary, 
  generateSummaryPrompt,
  generateHeadlinePrompt
};
