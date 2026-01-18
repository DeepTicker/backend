// services/generateNewsSummaryService.js

require('dotenv').config();
const { generateText } = require('../../config/gemini');

/**
 * Gemini로 뉴스 요약 생성
 * @param {string} prompt - 프롬프트(요약/배경지식 등)
 * @param {string} content - 뉴스 본문
 * @returns {Promise<string>} - 요약 결과
 */
async function geminiSummary(prompt, content) {
  return withRetry(async () => {
    const fullPrompt = `${prompt}\n\n[뉴스 본문]\n${content}`;
    const text = await generateText(fullPrompt);
    if (!text) {
      throw new Error("geminiSummary 응답 비어있음");
    }
    return text;
  });
}

async function withRetry(fn, retries = 3, delay = 5000) {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      let delayMs = delay;
      try {
        const retryInfo = error.errorDetails?.find(detail => detail['@type']?.includes('RetryInfo'));
        if (retryInfo?.retryDelay) {
          const seconds = parseInt(retryInfo.retryDelay.replace(/[^0-9]/g, ''));
          if (!isNaN(seconds)) delayMs = seconds * 1000;
        }
      } catch {}

      console.warn(`⏳ 429 재시도: ${delayMs / 1000}s 후 (${retries}회 남음)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delay);
    }

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

  아래 뉴스 내용을 기반으로 다음 형식의 JSON 객체로 분석 요약을 정리해줘.

  {
    "problem": "이슈 요약 (한 줄)",
    "causes": [
      "원인 1",
      "원인 2",
      ...
    ],
    "strategy": "투자자들의 대응 전략 요약",
    "implications": "이 뉴스가 시사하는 바, 투자자 유의사항 요약"
  }

  내용은 일반 투자자가 이해할 수 있게 작성하고, 불필요한 포장 없이 간결하게 요약해줘.`;
  }
  return "요약 수준이 정의되지 않았습니다.";
}


module.exports = { 
  geminiSummary, 
  generateSummaryPrompt,
  generateHeadlinePrompt
};
