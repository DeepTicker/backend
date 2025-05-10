// src/controllers/newsController.js
const pool = require('../../config/db');
const { generateBackground } = require('../services/generateBackground');
const { model } = require('../../config/gemini');

// 메인 뉴스 조회 컨트롤러 (getNewsList.js에서 통합)
async function getMainNews(req, res) {
  const limit = parseInt(req.query.limit) || 5;
  try {
    //전체 개수 쿼리
    const totalQuery = `SELECT COUNT(*) FROM news_raw`;
    const { rows: countRows } = await pool.query(totalQuery);
    const totalNews = parseInt(countRows[0].count);

    // 뉴스 목록 쿼리
    const query = `
      SELECT nr.id, nr.title, nr.press, nr.date, nc.category, nc.representative
      FROM news_raw nr
      JOIN news_classification nc ON nr.id = nc.news_id
      ORDER BY nr.date DESC NULLS LAST, nr.id DESC
      LIMIT $1
    `;

    const { rows } = await pool.query(query, [limit]);
    res.json(rows);
  } catch (err) {
    console.error("❌ 메인 뉴스 조회 실패:", err);
    res.status(500).json({ error: "서버 오류" });
  }
}

// 뉴스 목록 조회 컨트롤러 (getNewsList.js에서 통합)
async function getNewsList(req, res) {
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 20;
  const offset = (page - 1) * size;

  try {
    const query = `
      SELECT nr.id, nr.title, nr.press, nr.date ,nc.category, nc.representative
      FROM news_raw nr
      JOIN news_classification nc ON nr.id = nc.news_id
      ORDER BY nr.date DESC NULLS LAST, nr.id DESC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(query, [size, offset]);

    // 전체 뉴스 개수를 구하는 쿼리
    const countQuery = `SELECT COUNT(*) FROM news_raw nr`;
    const { rows: countRows } = await pool.query(countQuery);
    const totalNews = parseInt(countRows[0].count);

    // 뉴스 목록과 총 개수를 응답
    res.json({ news: rows, total: totalNews });
  } catch (err) {
    console.error("❌ 뉴스 목록 조회 실패:", err);
    res.status(500).json({ error: "서버 오류" });
  }
}

// 뉴스 조회 컨트롤러
async function getNews(req, res) {
    try {
        const { page, limit, category, startDate, endDate } = req.query;
        
        // 파라미터 파싱 및 기본값 설정
        const parsedPage = parseInt(page) || 1;
        const parsedLimit = parseInt(limit) || 10;
        const offset = (parsedPage - 1) * parsedLimit;

        let query = `
            SELECT 
                nr.id,
                nr.title,
                nr.content,
                nr.press,
                nr.reporter,
                nr.url,
                nr.date,
                nc.category,
                nc.representative
            FROM news_raw nr
            LEFT JOIN news_classification nc ON nr.id = nc.news_id
            WHERE 1=1
        `;
        const params = [];

        if (category) {
            query += ` AND nc.category = $${params.length + 1}`;
            params.push(category);
        }

        if (startDate) {
            query += ` AND nr.date >= $${params.length + 1}`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND nr.date <= $${params.length + 1}`;
            params.push(endDate);
        }

        query += ` ORDER BY nr.date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parsedLimit, offset);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: error.message });
    }
}

// 뉴스 상세 조회 컨트롤러
async function getNewsDetail(req, res) {
    try {
        const newsId = parseInt(req.params.id);
        const level = req.query.level || '중급';
        console.log('뉴스 상세 조회:', { newsId, level });

        // 1. 뉴스 원문 조회
        const newsQuery = `
            SELECT 
                nr.id,
                nr.title,
                nr.content,
                nr.press,
                nr.reporter,
                nr.url,
                nr.date,
                nr.crawled_at,
                nc.category,
                nc.representative
            FROM news_raw nr
            LEFT JOIN news_classification nc ON nr.id = nc.news_id
            WHERE nr.id = $1
        `;
        const newsResult = await pool.query(newsQuery, [newsId]);
        
        if (newsResult.rows.length === 0) {
            return res.status(404).json({ error: '뉴스를 찾을 수 없습니다.' });
        }
        const rawNews = newsResult.rows[0];
        console.log('뉴스 원문 조회 결과:', rawNews);

        // 2. 요약 데이터 조회
        const summaryQuery = `
            SELECT 
                headline AS one_line_summary,
                summary AS full_summary,
                background_knowledge AS background
            FROM news_summary
            WHERE news_id = $1 AND level = $2
        `;
        const summaryResult = await pool.query(summaryQuery, [newsId, level]);
        const gptNews = summaryResult.rows[0] || { one_line_summary: null, full_summary: null, background: null };
        console.log('요약 데이터 조회 결과:', gptNews);

        // 3. 배경지식 생성 - 항상 실행
        console.log('배경지식 생성 시작');
        const background = await generateBackground(
            rawNews.category,
            level,
            rawNews.content,
            rawNews.representative
        );
        
        if (background) {
            gptNews.background = gptNews.background 
                ? `${gptNews.background}<br><br>${background}`
                : background;
            console.log('배경지식 생성 완료:', gptNews.background);
        }

        // 4. 합쳐서 반환
        res.json({ rawNews, gptNews });
    } catch (error) {
        console.error('Error fetching news detail:', error);
        res.status(500).json({ error: error.message });
    }
}

// Gemini로 뉴스 요약 생성
async function generateNewsSummary(req, res) {
    try {
        const newsId = parseInt(req.params.id);
        const level = req.query.level || '중급';

        // 1. DB에서 필요한 정보 조회
        const query = `
            SELECT nr.title, nr.content, nc.category, nc.representative
            FROM news_raw nr
            LEFT JOIN news_classification nc ON nr.id = nc.news_id
            WHERE nr.id = $1
        `;
        const { rows } = await pool.query(query, [newsId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: '뉴스를 찾을 수 없습니다.' });
        }
        
        const { title, content, category, representative } = rows[0];

        // 2. 프롬프트 생성
        const prompt = generateSummaryPrompt(level, category, representative);

        // 3. Gemini 요약 호출
        const summary = await geminiSummary(prompt, content);

        res.json({ summary });
    } catch (error) {
        console.error('Gemini 요약 오류:', error);
        res.status(500).json({ error: 'Gemini 요약 실패' });
    }
}

// 요약 프롬프트 생성 함수
function generateSummaryPrompt(level, category, representative) {
    return `
        다음은 ${category} 카테고리의 ${representative} 관련 뉴스입니다.
        ${level} 수준의 독자를 위해 다음 형식으로 요약해주세요:

        1. 한 줄 요약 (핵심 내용)
        2. 전체 요약 (상세 내용)
        3. 배경 지식 (이해를 돕는 추가 정보)

        각 섹션은 명확하게 구분해주세요.
    `;
}

// Gemini API 호출 함수
async function geminiSummary(prompt, content) {
    try {
        const result = await model.generateContent(prompt + "\n\n" + content);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini API 호출 오류:', error);
        throw error;
    }
}

module.exports = {
    getMainNews,
    getNewsList,
    getNews,
    getNewsDetail,
    generateNewsSummary
};