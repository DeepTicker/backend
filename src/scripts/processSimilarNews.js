// src/scripts/processSimilarNews.js

const { Client } = require('pg');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
const dayjs = require('dayjs');
dotenv.config();

// 로그 함수
function log(message, type = 'info') {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

// 대표 뉴스의 제목으로 본문을 news_raw → past_news 순서로 조회
async function fetchNewsContentByTitle(title) {
    const client = new Client({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
    });
    await client.connect();
  
    // 1차 시도: news_raw
    let result = await client.query(
      `SELECT content FROM news_raw WHERE title = $1 LIMIT 1`,
      [title]
    );
    if (result.rows.length > 0) {
      await client.end();
      return result.rows[0].content;
    }
  
    // 2차 시도: past_news
    result = await client.query(
      `SELECT content FROM past_news WHERE title = $1 LIMIT 1`,
      [title]
    );
    await client.end();
  
    if (result.rows.length > 0) return result.rows[0].content;
  
    return null;
  }

// 📰 뉴스 제목과 요약 가져오기
async function getNewsForSimilarity() {
    const client = new Client({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
    });
    await client.connect();

    const query = `
        SELECT nr.id, nr.title, nr.content, ns.summary
        FROM news_raw nr
        JOIN news_summary ns ON nr.id = ns.news_id
        WHERE ns.level = '고급'
        ORDER BY nr.id DESC
        LIMIT 100;
    `;

    const result = await client.query(query);
    await client.end();
    return result.rows;
}

// 🔍 대표 뉴스 1건 추출
async function getTopSimilarNews(summaryText) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const pythonProcess = spawn('python', ['src/scripts/run_similarity_cluster.py', summaryText]);

        pythonProcess.stdout.on('data', (data) => {
            chunks.push(data.toString());
        });


        pythonProcess.on('close', (code) => {
            if (code !== 0) return reject(new Error(`run_similarity_cluster.py exited with code ${code}`));

            try {
                const output = chunks.join('');
                const parsed = JSON.parse(output);
                if (parsed.date && parsed.title) {
                    resolve({ date: parsed.date, title: parsed.title });
                } else {
                    reject(new Error("대표 뉴스 추출 실패 (JSON 무효)"));
                }
            } catch (err) {
                reject(new Error("대표 뉴스 추출 실패 (JSON 파싱 실패)"));
            }
        });
    });
}

// 📈 주가 분석 실행
async function runStockChangeAnalysis(date, content) {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python', ['src/scripts/get_stock_change.py', date, content]);

        pythonProcess.stdout.on('data', (data) => {
            log(`📊 Stock change result:\n${data.toString()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            log(`⚠️ Stock change error: ${data.toString()}`, 'error');
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`get_stock_change.py exited with code ${code}`));
            }
        });
    });
}

// 🔄 유사 뉴스 + 주가 분석 전체 실행
async function processSimilarNews() {
    log('🔄 Starting full analysis (similarity + stock change)...');

    try {
        const news = await getNewsForSimilarity();
        log(`📰 Loaded ${news.length} news articles.`);

        for (const article of news) {
            const summaryText = `${article.title} ${article.summary}`;
            log(`➡️ Processing news ID ${article.id}`);

            // 대표 뉴스 추출
            const similar = await getTopSimilarNews(summaryText);
            log(`✅ Representative news: ${similar.date} / ${similar.title}`);

            // 해당 날짜 뉴스 본문 찾기
            function normalizeText(str) {
                return str
                    .normalize("NFKC")
                    .replace(/\s+/g, ' ')
                    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width 문자 제거
                    .trim();
            }

            console.log("🔍 비교용 제목 출력");
            for (const n of news) {
                console.log("[DB 제목]", normalizeText(n.title));
            }
            console.log("[대표 뉴스 제목]", normalizeText(similar.title));


            const newsContent = await fetchNewsContentByTitle(similar.title);
            if (!newsContent) {
            log(`⚠️ Original content not found in DB for "${similar.title}"`, 'error');
            continue;
            }

            // 주가 변화 분석
            await runStockChangeAnalysis(similar.date, newsContent);

            // 다음 기사 처리 전 대기
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        log('✅ All news processed successfully!');

    } catch (err) {
        log(`❗ Error: ${err.message}`, 'error');
        process.exit(1);
    }
}

// 실행
processSimilarNews();
