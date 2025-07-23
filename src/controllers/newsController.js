// src/controllers/newsController.js (최적화된 DB 스키마용)
const pool = require('../../config/db');
const { 
    generateIntermediateIndustryBackground,
    generateIntermediateThemeBackground,
    generateIntermediateMacroBackground,
    generateIntermediateStockBackground,
    generateBasicTermBackground,
    generateBasicIndustryBackground,
    generateBasicThemeBackground,
    generateAdvancedIndustryBackground,
    generateAdvancedStockBackground
} = require('../services/generateBackground');
const { model } = require('../../config/gemini');

// 메인 뉴스 조회 컨트롤러 (최적화된 스키마 사용)
async function getMainNews(req, res) {
  const limit = parseInt(req.query.limit) || 5;
  try {
    // 전체 개수 쿼리
    const totalQuery = `SELECT COUNT(*) FROM news_raw`;
    const { rows: countRows } = await pool.query(totalQuery);
    const totalNews = parseInt(countRows[0].count);

    // 뉴스 목록 쿼리 (최적화된 구조)
    const query = `
      SELECT 
        nr.id, 
        nr.title, 
        nr.press, 
        nr.date,
        COALESCE(
          json_agg(
            CASE 
              WHEN nc.category = '개별주' THEN
                json_build_object(
                  'category', nc.category,
                  'stock_code', nc.stock_code,
                  'stock_name', ts.stock_name,
                  'confidence', nc.confidence_score
                )
              WHEN nc.category = '전반적' THEN
                json_build_object(
                  'category', nc.category,
                  'macro_category_code', nc.macro_category_code,
                  'macro_category_name', mcm.category_name,
                  'macro_cause', nc.macro_cause,
                  'macro_effect', nc.macro_effect,
                  'confidence', nc.confidence_score
                )
              WHEN nc.category = '산업군' THEN
                json_build_object(
                  'category', nc.category,
                  'industry_name', nc.industry_name,
                  'confidence', nc.confidence_score
                )
              WHEN nc.category = '테마' THEN
                json_build_object(
                  'category', nc.category,
                  'theme_name', nc.theme_name,
                  'confidence', nc.confidence_score
                )
              ELSE
                json_build_object(
                  'category', nc.category,
                  'confidence', nc.confidence_score
                )
            END
          ) FILTER (WHERE nc.category IS NOT NULL),
          '[]'
        ) as classifications
      FROM news_raw nr
      LEFT JOIN news_classification nc ON nr.id = nc.news_id
      LEFT JOIN tmp_stock ts ON nc.stock_code = ts.stock_code
      LEFT JOIN macro_category_master mcm ON nc.macro_category_code = mcm.category_code
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

// 뉴스 목록 조회 컨트롤러 (최적화된 스키마 사용)
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
        COALESCE(
          json_agg(
            CASE 
              WHEN nc.category = '개별주' THEN
                json_build_object(
                  'category', nc.category,
                  'stock_code', nc.stock_code,
                  'stock_name', ts.stock_name,
                  'confidence', nc.confidence_score
                )
              WHEN nc.category = '전반적' THEN
                json_build_object(
                  'category', nc.category,
                  'macro_category_code', nc.macro_category_code,
                  'macro_category_name', mcm.category_name,
                  'macro_cause', nc.macro_cause,
                  'macro_effect', nc.macro_effect,
                  'confidence', nc.confidence_score
                )
              WHEN nc.category = '산업군' THEN
                json_build_object(
                  'category', nc.category,
                  'industry_name', nc.industry_name,
                  'confidence', nc.confidence_score
                )
              WHEN nc.category = '테마' THEN
                json_build_object(
                  'category', nc.category,
                  'theme_name', nc.theme_name,
                  'confidence', nc.confidence_score
                )
              ELSE
                json_build_object(
                  'category', nc.category,
                  'confidence', nc.confidence_score
                )
            END
          ) FILTER (WHERE nc.category IS NOT NULL),
          '[]'
        ) as classifications
      FROM news_raw nr
      LEFT JOIN news_classification nc ON nr.id = nc.news_id
      LEFT JOIN tmp_stock ts ON nc.stock_code = ts.stock_code
      LEFT JOIN macro_category_master mcm ON nc.macro_category_code = mcm.category_code
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

// 필터링된 뉴스 조회 컨트롤러
async function getNews(req, res) {
    try {
        const { page, limit, category, startDate, endDate, stock_code, macro_category } = req.query;
        
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
                COALESCE(
                  json_agg(
                    CASE 
                      WHEN nc.category = '개별주' THEN
                        json_build_object(
                          'category', nc.category,
                          'stock_code', nc.stock_code,
                          'stock_name', ts.stock_name,
                          'confidence', nc.confidence_score
                        )
                      WHEN nc.category = '전반적' THEN
                        json_build_object(
                          'category', nc.category,
                          'macro_category_code', nc.macro_category_code,
                          'macro_category_name', mcm.category_name,
                          'macro_cause', nc.macro_cause,
                          'macro_effect', nc.macro_effect,
                          'confidence', nc.confidence_score
                        )
                      WHEN nc.category = '산업군' THEN
                        json_build_object(
                          'category', nc.category,
                          'industry_name', nc.industry_name,
                          'confidence', nc.confidence_score
                        )
                      WHEN nc.category = '테마' THEN
                        json_build_object(
                          'category', nc.category,
                          'theme_name', nc.theme_name,
                          'confidence', nc.confidence_score
                        )
                      ELSE
                        json_build_object(
                          'category', nc.category,
                          'confidence', nc.confidence_score
                        )
                    END
                  ) FILTER (WHERE nc.category IS NOT NULL),
                  '[]'
                ) as classifications
            FROM news_raw nr
            LEFT JOIN news_classification nc ON nr.id = nc.news_id
            LEFT JOIN tmp_stock ts ON nc.stock_code = ts.stock_code
            LEFT JOIN macro_category_master mcm ON nc.macro_category_code = mcm.category_code
            WHERE 1=1
        `;
        const params = [];

        // 필터링 조건 추가
        if (category) {
            query += ` AND nc.category = $${params.length + 1}`;
            params.push(category);
        }

        if (stock_code) {
            query += ` AND nc.stock_code = $${params.length + 1}`;
            params.push(stock_code);
        }

        if (macro_category) {
            query += ` AND nc.macro_category_code = $${params.length + 1}`;
            params.push(macro_category);
        }

        if (startDate) {
            query += ` AND nr.date >= $${params.length + 1}`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND nr.date <= $${params.length + 1}`;
            params.push(endDate);
        }

        query += ` GROUP BY nr.id, nr.title, nr.content, nr.press, nr.reporter, nr.url, nr.date`;
        query += ` ORDER BY nr.date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parsedLimit, offset);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: error.message });
    }
}

// 뉴스 상세 조회 컨트롤러 (최적화된 스키마 사용)
async function getNewsDetail(req, res) {
    try {
        const newsId = parseInt(req.params.id);
        const level = req.query.level || '중급';

        // 1. 뉴스 원문 + 분류 정보 (최적화된 스키마 사용)
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
                    CASE 
                      WHEN nc.category = '개별주' THEN
                        json_build_object(
                          'category', nc.category,
                          'stock_code', nc.stock_code,
                          'stock_name', ts.stock_name,
                          'confidence', nc.confidence_score
                        )
                      WHEN nc.category = '전반적' THEN
                        json_build_object(
                          'category', nc.category,
                          'macro_category_code', nc.macro_category_code,
                          'macro_category_name', mcm.category_name,
                          'macro_cause', nc.macro_cause,
                          'macro_effect', nc.macro_effect,
                          'confidence', nc.confidence_score
                        )
                      WHEN nc.category = '산업군' THEN
                        json_build_object(
                          'category', nc.category,
                          'industry_name', nc.industry_name,
                          'confidence', nc.confidence_score
                        )
                      WHEN nc.category = '테마' THEN
                        json_build_object(
                          'category', nc.category,
                          'theme_name', nc.theme_name,
                          'confidence', nc.confidence_score
                        )
                      ELSE
                        json_build_object(
                          'category', nc.category,
                          'confidence', nc.confidence_score
                        )
                    END
                  ) FILTER (WHERE nc.category IS NOT NULL),
                  '[]'
                ) as classifications
            FROM news_raw nr
            LEFT JOIN news_classification nc ON nr.id = nc.news_id
            LEFT JOIN tmp_stock ts ON nc.stock_code = ts.stock_code
            LEFT JOIN macro_category_master mcm ON nc.macro_category_code = mcm.category_code
            WHERE nr.id = $1
            GROUP BY nr.id, nr.title, nr.content, nr.press, nr.reporter, nr.url, nr.date, nr.crawled_at, nr.image_url, nr.image_desc
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

        // 3. 배경지식 조회 (필요시 기존 로직 유지)
        const backgrounds = [];
        
        // 응답 데이터 구성
        const responseData = {
            ...rawNews,
            one_line_summary: summary.one_line_summary,
            full_summary: summary.full_summary,
            backgrounds: backgrounds
        };

        res.json(responseData);

    } catch (error) {
        console.error('Error fetching news detail:', error);
        res.status(500).json({ error: error.message });
    }
}

// 거시경제 분류별 뉴스 조회 (새로운 기능)
async function getMacroNewsByCategory(req, res) {
    try {
        const { macro_category_code } = req.params;
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const offset = (page - 1) * size;

        const query = `
            SELECT 
                nr.id,
                nr.title,
                nr.press,
                nr.date,
                nc.macro_cause,
                nc.macro_effect,
                nc.confidence_score,
                mcm.category_name
            FROM news_raw nr
            JOIN news_classification nc ON nr.id = nc.news_id
            JOIN macro_category_master mcm ON nc.macro_category_code = mcm.category_code
            WHERE nc.category = '전반적' AND nc.macro_category_code = $1
            ORDER BY nr.date DESC
            LIMIT $2 OFFSET $3
        `;

        const { rows } = await pool.query(query, [macro_category_code, size, offset]);
        
        // 총 개수 조회
        const countQuery = `
            SELECT COUNT(*) 
            FROM news_classification nc
            WHERE nc.category = '전반적' AND nc.macro_category_code = $1
        `;
        const { rows: countRows } = await pool.query(countQuery, [macro_category_code]);
        const total = parseInt(countRows[0].count);

        res.json({ news: rows, total });
    } catch (error) {
        console.error('Error fetching macro news:', error);
        res.status(500).json({ error: error.message });
    }
}

// 주식별 뉴스 조회 (새로운 기능)
async function getStockNews(req, res) {
    try {
        const { stock_code } = req.params;
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10;
        const offset = (page - 1) * size;

        const query = `
            SELECT 
                nr.id,
                nr.title,
                nr.press,
                nr.date,
                ts.stock_name,
                nc.confidence_score
            FROM news_raw nr
            JOIN news_classification nc ON nr.id = nc.news_id
            JOIN tmp_stock ts ON nc.stock_code = ts.stock_code
            WHERE nc.category = '개별주' AND nc.stock_code = $1
            ORDER BY nr.date DESC
            LIMIT $2 OFFSET $3
        `;

        const { rows } = await pool.query(query, [stock_code, size, offset]);
        
        // 총 개수 조회
        const countQuery = `
            SELECT COUNT(*) 
            FROM news_classification nc
            WHERE nc.category = '개별주' AND nc.stock_code = $1
        `;
        const { rows: countRows } = await pool.query(countQuery, [stock_code]);
        const total = parseInt(countRows[0].count);

        res.json({ news: rows, total });
    } catch (error) {
        console.error('Error fetching stock news:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getMainNews,
    getNewsList,
    getNews,
    getNewsDetail,
    getMacroNewsByCategory,
    getStockNews
};