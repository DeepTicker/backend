// src/services/generateSimilarNewsInsight.js

const { spawn } = require('child_process');
const pool = require('../../config/db');
const { generateText } = require('../../config/gemini');
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

[주요 종목 및 주가 변화]
`;
  stockChanges.forEach(stock => {
    const change = stock.변화율;
    prompt += `- ${stock.종목명}: +3일 ${change['+3일']}%, +7일 ${change['+7일']}%, -3일대비 ${change['-3일대비']}%
`;
  });

  prompt += `
과거 뉴스와 주가 흐름을 기반으로 GPT의 전문가 관점에서 다음을 작성해주세요:
1. 뉴스 요약 (1~2문장)
2. 주가 변화에 대한 인과적 해설 및 투자 인사이트 (2문단)

출력은 반드시 아래와 같은 JSON 형식으로 출력해주세요. 문자열 외의 출력은 절대 하지 마세요요
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

  const similarNewsList = await runPythonScript('src/scripts/run_similarity_cluster.py', [query]);

  if (!Array.isArray(similarNewsList)) throw new Error('유사 뉴스 목록 오류');

  const insights = [];

  for (const news of similarNewsList) {
    const { date, title: pastTitle } = news;
    const newsTextResult = await pool.query(
      `SELECT content FROM news_raw WHERE title = $1
       UNION ALL
       SELECT content FROM past_news WHERE title = $1 LIMIT 1`,
      [pastTitle]
    );
    if (newsTextResult.rows.length === 0) continue;

    const pastContent = newsTextResult.rows[0].content;

    const stockChanges = await runPythonScript('src/scripts/get_stock_change.py', [date, pastContent]);

    const prompt = buildPromptFromStockChange(pastContent, pastTitle, date, stockChanges);

    const rawText = await generateText(prompt);
    const cleanedText = rawText.trim()
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();
    const parsed = JSON.parse(cleanedText);

    insights.push({
      past_title: pastTitle,
      past_date: date,
      change_summary: stockChanges,
      gpt_summary: parsed.summary,
      gpt_insight: parsed.insight
    });
  }

  return insights;
}

module.exports = { generateSimilarNewsInsight };
