// src/services/generateNewsStockIn.js
const pool = require('../../config/db');
const { model } = require('../../config/gemini');

// 주식 코드 또는 회사명으로 주식 정보 가져오기
async function getStockInfo(stockCodeOrName) {
    // 먼저 주식 코드로 검색 시도
    let query = `
        SELECT stock_code, stock_name
        FROM tmp_stock
        WHERE stock_code = $1
    `;
    
    let result = await pool.query(query, [stockCodeOrName]);
    
    // 주식 코드로 찾지 못한 경우 회사명으로 검색 시도 (정확히 일치하는 것만)
    if (result.rows.length === 0) {
        query = `
            SELECT stock_code, stock_name
            FROM tmp_stock
            WHERE stock_name = $1
        `;
        
        result = await pool.query(query, [stockCodeOrName]);
    }
    
    return result.rows[0];
}

// 최근 특정 주식 관련 뉴스 가져오기
async function getRecentStockNews(stock_name) {
    let result = { rows: [] };

    try {
        const query = `
            SELECT nr.id, nr.title, nr.content, nr.date
            FROM news_raw nr
            JOIN news_classification nc ON nr.id = nc.news_id
            WHERE nc.category = '개별주'
            AND nc.stock_code = $1
            AND nr.date >= CURRENT_DATE - INTERVAL '20 days'
            ORDER BY nr.date DESC
            LIMIT 20
        `;
        
        result = await pool.query(query, [stock_name]);
        console.log(`${stock_name} 관련 뉴스 ${result.rows.length}개 찾음`);
    } catch (error) {
        console.error('Error in getRecentStockNews:', error);
    }
    
    return result.rows;
}


// Gemini를 사용하여 주식 이슈 요약 생성
async function generateStockSummary(stockInfo, news) {
    console.log('=== generateStockSummary 시작 ===');
    console.log(`주식: ${stockInfo.stock_name}(${stockInfo.stock_code})`);
    console.log(`입력된 뉴스 수: ${news.length}`);

    // 뉴스가 없는 경우 기본 응답 반환
    if (news.length === 0) {
        return {
            titles: [`${stockInfo.stock_name} 관련 최근 이슈가 없습니다`],
            descriptions: ["-"],
            indicators: ["-"],
            impacts: ["-"]
        };
    }

    const prompt = `
        최근 20일간의 ${stockInfo.stock_name}(${stockInfo.stock_code}) 관련 뉴스를 분석하여 가장 중요한 이슈 5가지를 추출해주세요.
        일반 투자자가 이해할 수 있는 수준으로 설명해주세요.
        
        반드시 다음의 json 형식으로 작성해주세요:
        
        [
            {
                "title": "이슈 제목",
                "description": "이슈 설명 (한 문단)",
                "indicators": ["관련 지표1", "관련 지표2"],
                "impact": "주가에 미친 영향 요약"
            },
            ...
        ]

        불필요한 꾸밈말 없이 간결하게 정리해주세요.

        분석할 뉴스 목록:
        ${news.map(n => `- ${n.title} (${n.date})`).join('\n')}
        `;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        
        let issues;
        try {
            const cleanedText = responseText
                .replace(/^```json/, '')
                .replace(/^```/, '')
                .replace(/```$/, '')
                .trim();
        
            issues = JSON.parse(cleanedText);
        } catch (err) {
            console.error('❌ JSON 파싱 오류:', err);
            return {
                titles: [`${stockInfo.stock_name} 관련 최근 이슈가 없습니다`],
                descriptions: ["이슈를 파싱할 수 없습니다."],
                indicators: ["없음"],
                impacts: ["없음"]
            };
        }
        
        if (!Array.isArray(issues) || issues.length === 0) {
            return {
                titles: [`${stockInfo.stock_name} 관련 최근 이슈가 없습니다`],
                descriptions: ["최근 뉴스 기반 이슈가 충분하지 않습니다."],
                indicators: ["-"],
                impacts: ["-"]
            };
        }
        
        const summaryResult = {
            titles: issues.map(i => i.title || ''),
            descriptions: issues.map(i => i.description || ''),
            indicators: issues.map(i =>
                Array.isArray(i.indicators) ? i.indicators.join(', ') : i.indicators || ''),
            impacts: issues.map(i => i.impact || '')
        };
        
        return summaryResult;
        
}

// DB에 주식 이슈 저장
async function saveStockIssues(stockCode, stockName, titles, descriptions, indicators, impacts) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const currentDate = new Date().toISOString().split('T')[0];
        
        const query = `
            INSERT INTO stock_issue 
            (stock_code, stock_name, summary_date, summary_title, summary_detail, related_indicators, price_impact)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (stock_code, summary_date) 
            DO UPDATE SET 
                summary_title = $4,
                summary_detail = $5,
                related_indicators = $6,
                price_impact = $7
        `;
        
        await client.query(query, [
            stockCode,
            stockName,
            currentDate,
            titles,
            descriptions,
            indicators,
            impacts
        ]);
        
        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// 주식 이슈 생성 및 저장
async function generateAndSaveStockIssues(stockCodeOrName) {
    console.log('=== generateAndSaveStockIssues 시작 ===');
    console.log(`주식 코드 또는 이름: ${stockCodeOrName}`);
    
    try {
        const stockInfo = await getStockInfo(stockCodeOrName);
        if (!stockInfo) {
            throw new Error(`!!! 주식 정보를 찾을 수 없습니다: ${stockCodeOrName}`);
        }

        console.log(`📌 stock_code: ${stockInfo.stock_code}, stock_name: ${stockInfo.stock_name}`);

        
        const recentNews = await getRecentStockNews(stockInfo.stock_name);
        console.log(`최근 뉴스 ${recentNews.length}개 발견`);
        
        const summary = await generateStockSummary(stockInfo, recentNews);
        
        if (!summary || !summary.titles || !summary.descriptions) {
            throw new Error('요약 생성에 실패했습니다.');
        }
        
        const result = await saveStockIssues(
            stockInfo.stock_code,
            stockInfo.stock_name,
            summary.titles,
            summary.descriptions,
            summary.indicators,
            summary.impacts
        );
        
        return result;
    } catch (error) {
        console.error('Error in generateAndSaveStockIssues:', error);
        throw error;
    }
}

module.exports = {
    generateAndSaveStockIssues,
    getStockInfo
};