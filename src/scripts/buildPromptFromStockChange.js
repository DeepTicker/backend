import { format } from 'date-fns';

export function buildPromptFromStockChange(newsTitle, newsDate, stockChanges) {
  let prompt = `
[뉴스 제목]
${newsTitle}

[뉴스 날짜]
${format(new Date(newsDate), 'yyyy-MM-dd')}

[주요 종목 및 주가 변화]
`;
  stockChanges.forEach(stock => {
    const change = stock.변화율;
    prompt += `- ${stock.종목명}: +3일 ${change['+3일']}%, +7일 ${change['+7일']}%, -3일대비 ${change['-3일대비']}%
`;
  });

  prompt += `
위 뉴스와 주가 변화 흐름을 바탕으로 다음 두 가지를 GPT의 전문가 관점에서 작성해주세요.

1. 뉴스 요약 및 시장 흐름 요약 (1~2문장)
2. 주가 변화와 뉴스의 연관성에 대한 인과적 투자 인사이트 (Chain-of-Thought 기반, 2문단)

출력은 JSON 형식으로 다음 구조를 따라주세요:
{
  "summary": "...",
  "insight": "..."
}`;

  return prompt.trim();
}