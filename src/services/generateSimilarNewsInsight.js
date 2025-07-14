// src/services/generateSimilarNewsInsight.js

const { spawn } = require('child_process');
const pool = require('../../config/db');
const { model } = require('../../config/gemini');
const dayjs = require('dayjs');

function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const process = spawn('python', [scriptPath, ...args]);

    process.stdout.on('data', (data) => chunks.push(data.toString()));
    process.stderr.on('data', (data) => console.error('[Python error]', data.toString()));

    process.on('close', (code) => {
      if (code === 0) {
        try {
          const output = chunks.join('');
          const parsed = JSON.parse(output);
          resolve(parsed);
        } catch (err) {
          reject(new Error('Python script output parse error'));
        }
      } else {
        reject(new Error(`Python script failed with code ${code}`));
      }
    });
  });
}

function buildPromptFromStockChange(newsText, pastTitle, pastDate, stockChanges) {
  let prompt = `
[과거 유사 뉴스 제목]
${pastTitle}

[뉴스 날짜]
${pastDate}

[뉴스 내용]
${newsText}

[주요 지수 및 시장 변화]
`;
  
  // 코스피, 코스닥 지수 변화 먼저 표시
  const indices = stockChanges.filter(stock => ['kospi', 'kosdaq'].includes(stock.종목코드));
  indices.forEach(index => {
    const change = index.변화율;
    const indexName = index.종목코드 === 'kospi' ? 'KOSPI' : 'KOSDAQ';
    prompt += `- ${indexName}: +3일 ${change['+3일']}%, +7일 ${change['+7일']}%, -3일대비 ${change['-3일대비']}%
`;
  });

  // 개별 주식 변화 (있다면)
  const stocks = stockChanges.filter(stock => !['kospi', 'kosdaq'].includes(stock.종목코드));
  if (stocks.length > 0) {
    prompt += `
[주요 종목 변화]
`;
    stocks.forEach(stock => {
      const change = stock.변화율;
      prompt += `- ${stock.종목명}: +3일 ${change['+3일']}%, +7일 ${change['+7일']}%, -3일대비 ${change['-3일대비']}%
`;
    });
  }

  prompt += `
과거 뉴스와 시장 흐름을 기반으로 GPT의 전문가 관점에서 다음을 작성해주세요:
1. 뉴스 요약 (1~2문장)
2. 시장 지수 변화에 대한 인과적 해설 및 투자 인사이트 (2문단)

출력은 반드시 아래와 같은 JSON 형식으로 출력해주세요. 문자열 외의 출력은 절대 하지 마세요:
{
  "summary": "...",
  "insight": "..."
}
`;

  return prompt.trim();
}

async function generateSimilarNewsInsight(newsId) {
  const { rows } = await pool.query(
    `SELECT nr.title, nr.content, ns.summary
     FROM news_raw nr
     JOIN news_summary ns ON nr.id = ns.news_id
     WHERE nr.id = $1 AND ns.level = '고급'`,
    [newsId]
  );
  if (rows.length === 0) throw new Error('뉴스를 찾을 수 없습니다');

  const { title, content, summary } = rows[0];
  const query = `${title} ${summary}`;

  console.log(`뉴스 분석 시작: ${title}`);

  const similarNewsList = await runPythonScript('src/scripts/run_similarity_cluster.py', [query]);

  if (!Array.isArray(similarNewsList)) throw new Error('유사 뉴스 목록 오류');

  const insights = [];

  for (const news of similarNewsList) {
    const { date, title: pastTitle } = news;
    
    console.log(`과거 사례 분석: ${pastTitle} (${date})`);
    
    const newsTextResult = await pool.query(
      `SELECT content FROM news_raw WHERE title = $1
       UNION ALL
       SELECT content FROM past_news WHERE title = $1 LIMIT 1`,
      [pastTitle]
    );
    if (newsTextResult.rows.length === 0) continue;

    const pastContent = newsTextResult.rows[0].content;

    // 코스피/코스닥 지수 중심으로 분석
    const stockChanges = await runPythonScript('src/scripts/get_stock_change.py', [date, pastContent, 'kospi', 'kosdaq']);

    const prompt = buildPromptFromStockChange(pastContent, pastTitle, date, stockChanges);

    const gpt = await model.generateContent(prompt);
    const response = await gpt.response;
    const parsed = JSON.parse(response.text());

    insights.push({
      past_title: pastTitle,
      past_date: date,
      change_summary: stockChanges,
      gpt_summary: parsed.summary,
      gpt_insight: parsed.insight
    });
  }

  console.log(`뉴스 분석 완료: ${insights.length}개 사례`);
  return insights;
}

module.exports = { generateSimilarNewsInsight };
