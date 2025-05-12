// src/controllers/newsController.js
const pool = require('../../config/db');
const { 
    generateIntermediateIndustryBackground,
    generateIntermediateThemeBackground,
    generateIntermediateMacroBackground,
    generateIntermediateStockBackground,
    generateBasicTermBackground,
    generateBasicIndustryBackground,
    generateBasicThemeBackground
} = require('../services/generateBackground');
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
      SELECT 
        nr.id, 
        nr.title, 
        nr.press, 
        nr.date,
        json_agg(
          json_build_object(
            'category', nc.category,
            'representative', nc.representative
          )
        ) as classifications
      FROM news_raw nr
      LEFT JOIN news_classification nc ON nr.id = nc.news_id
      GROUP BY nr.id, nr.title, nr.press, nr.date
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
      SELECT 
        nr.id, 
        nr.title, 
        nr.press, 
        nr.date,
        json_agg(
          json_build_object(
            'category', nc.category,
            'representative', nc.representative
          )
        ) as classifications
      FROM news_raw nr
      LEFT JOIN news_classification nc ON nr.id = nc.news_id
      GROUP BY nr.id, nr.title, nr.press, nr.date
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

// ✅ 수정된 뉴스 상세 조회 컨트롤러 (프론트에 맞춤)
async function getNewsDetail(req, res) {
    try {
        const newsId = parseInt(req.params.id);
        const level = req.query.level || '중급';

        // 1. 뉴스 원문 + 분류 정보
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
                nr.image_url,
                nr.image_desc,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'category', nc.category,
                      'representative', nc.representative,
                      'stock_code', s.stock_code,
                      'theme_name', t.theme_name
                    )
                  ) FILTER (WHERE nc.category IS NOT NULL),
                  '[]'
                ) as classifications
            FROM news_raw nr
            LEFT JOIN news_classification nc ON nr.id = nc.news_id
            LEFT JOIN tmp_stock s ON nc.representative = s.stock_code OR nc.representative = s.stock_name
            LEFT JOIN theme_info t ON nc.representative = t.theme_name
            WHERE nr.id = $1
            GROUP BY nr.id
        `;
        const newsResult = await pool.query(newsQuery, [newsId]);

        if (newsResult.rows.length === 0) {
            return res.status(404).json({ error: '뉴스를 찾을 수 없습니다.' });
        }

        const rawNews = newsResult.rows[0];

        // 2. 요약 정보
        const summaryQuery = `
            SELECT 
                headline AS one_line_summary,
                summary AS full_summary
            FROM news_summary
            WHERE news_id = $1 AND level = $2
        `;
        const summaryResult = await pool.query(summaryQuery, [newsId, level]);
        const summary = summaryResult.rows[0] || { one_line_summary: null, full_summary: null };

        // 3. 배경지식 조회
        const backgrounds = [];
        let termCache = { used: false, html: null };
        let hasAppendedTerm = false;

        for (const classification of rawNews.classifications) {
            const { category, representative } = classification;
            let background = null;

            try {
                if (level === '중급') {
                    switch (category) {
                        case '산업군':
                            background = await generateIntermediateIndustryBackground(representative);
                            break;
                        case '테마':
                            background = await generateIntermediateThemeBackground(representative);
                            break;
                        case '전반적':
                            background = await generateIntermediateMacroBackground();
                            break;
                        case '개별주':
                            background = await generateIntermediateStockBackground(representative);
                            break;
                    }
                } else if (level === '초급') {
                    if (!termCache.used) {
                        termCache.html = await generateBasicTermBackground(rawNews.content);
                        termCache.used = true;
                    }
        
                    // ✅ 용어 설명은 한 번만 맨 앞에 따로 push
                    if (!hasAppendedTerm && termCache.html) {
                        backgrounds.push({
                            category: '용어 설명',
                            representative: '',
                            background: termCache.html
                        });
                        hasAppendedTerm = true;
                    }
        
                    if (category === '산업군') {
                        const ind = await generateBasicIndustryBackground(representative);
                        background = ind?.html || '';
                    } else if (category === '테마') {
                        const th = await generateBasicThemeBackground(representative);
                        background = th?.html || '';
                    } else {
                        // 그 외는 용어 설명으로 퉁침
                        background = null;
                    }
                }

                if (background) {
                    backgrounds.push({ category, representative, background });
                }
            } catch (e) {
                console.error(`⚠️ ${category} 배경지식 오류:`, e);
            }
        }

        // ✅ 프론트가 기대하는 응답 형식
        res.json({
            rawNews: {
                id: rawNews.id,
                title: rawNews.title,
                content: rawNews.content,
                press: rawNews.press,
                date: rawNews.date,
                classifications: rawNews.classifications,
                image_url: rawNews.image_url,
                image_desc: rawNews.image_desc
            },
            summary,
            backgrounds
        });
    } catch (err) {
        console.error('❌ 뉴스 상세 오류:', err);
        res.status(500).json({ error: '서버 오류' });
    }
}

// Gemini로 뉴스 요약 생성
async function generateNewsSummary(req, res) {
    try {
        const newsId = parseInt(req.params.id);
        const level = req.query.level || '중급';

        // 1. DB에서 필요한 정보 조회
        const query = `
            SELECT 
                nr.title, 
                nr.content,
                json_agg(
                    json_build_object(
                        'category', nc.category,
                        'representative', nc.representative
                    )
                ) FILTER (WHERE nc.category IS NOT NULL) as classifications
            FROM news_raw nr
            LEFT JOIN news_classification nc ON nr.id = nc.news_id
            WHERE nr.id = $1
            GROUP BY nr.id, nr.title, nr.content
        `;
        const { rows } = await pool.query(query, [newsId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: '뉴스를 찾을 수 없습니다.' });
        }
        
        const { title, content, classifications } = rows[0];

        // 2. 한 줄 요약 생성
        const headlinePrompt = generateHeadlinePrompt(classifications);
        const headline = await geminiSummary(headlinePrompt, content);

        // 3. 전체 요약 생성
        const summaryPrompt = generateSummaryPrompt(level, classifications);
        const fullSummary = await geminiSummary(summaryPrompt, content);

        // 4. 기본 요약 정보 저장
        const insertSummaryQuery = `
            INSERT INTO news_summary 
            (news_id, level, headline, summary)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (news_id, level) 
            DO UPDATE SET 
                headline = EXCLUDED.headline,
                summary = EXCLUDED.summary,
                generated_at = CURRENT_TIMESTAMP
        `;
        
        await pool.query(insertSummaryQuery, [
            newsId, level, headline, fullSummary
        ]);

        // 5. 각 카테고리별 최신 이슈 조회
        const backgrounds = [];
        for (const classification of classifications) {
            const { category, representative } = classification;
            let background = null;

            try {
                switch (category) {
                    case '산업군':
                        background = await generateIntermediateIndustryBackground(representative);
                        break;
                    case '테마':
                        background = await generateIntermediateThemeBackground(representative);
                        break;
                    case '전반적':
                        background = await generateIntermediateMacroBackground();
                        break;
                    case '개별주':
                        background = await generateIntermediateStockBackground(representative);
                        break;
                    case '그 외':
                        // 그 외 카테고리는 배경지식 없음
                        break;
                }

                if (background) {
                    backgrounds.push({
                        category,
                        representative,
                        background
                    });
                }
            } catch (error) {
                console.error(`${category} 배경지식 생성 중 오류:`, error);
                // 개별 카테고리 오류는 전체 프로세스를 중단하지 않음
            }
        }

        res.json({ 
            headline,
            fullSummary,
            classifications,
            backgrounds
        });
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