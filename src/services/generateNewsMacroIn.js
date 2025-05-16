// src/services/generateNewsMacroIn.js
const pool = require('../../config/db');
const { model } = require('../../config/gemini');

// 최근 뉴스 가져오기
async function getRecentMacroNews() {
    const query = `
        SELECT nr.id, nr.title, nr.content, nr.date
        FROM news_raw nr
        JOIN news_classification nc ON nr.id = nc.news_id
        WHERE nc.category = '전반적'
        AND nr.date >= CURRENT_DATE - INTERVAL '20 days'
        ORDER BY nr.date DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
}

// Gemini를 사용하여 매크로 이슈 요약 생성
async function generateMacroSummary(news, currentNewsId = null) {
    console.log('=== generateMacroSummary 시작 ===');
    console.log(`입력된 뉴스 수: ${news.length}`);

    // 현재 뉴스 정보 가져오기
    let currentNewsInfo = '';
    if (currentNewsId) {
        const currentNews = news.find(n => n.id === currentNewsId);
        if (currentNews) {
            currentNewsInfo = `
                현재 보고 있는 뉴스:
                제목: ${currentNews.title}
                내용: ${currentNews.content}
                
                위 뉴스와 관련된 경제/시장 이슈를 우선적으로 고려해주세요.
                특히 이 뉴스와 연관된 주요 경제지표나 전세계적인 상황을 중심으로 분석해주세요.
            `;
        }
    }

    const prompt = `
    최근 20일간의 경제/시장 뉴스를 기반으로 가장 중요한 이슈 5가지를 다음과 같은 JSON 배열로 정리해줘.

    [
    {
        "title": "이슈 제목",
        "description": "이슈에 대한 상세 설명",
        "indicators": ["관련 경제 지표 1", "관련 경제 지표 2"],
        "impact": "해당 이슈가 시장에 미치는 영향"
    },
    ...
    ]

    일반 투자자가 이해할 수 있도록 쉽게 작성해줘.

    분석할 뉴스 목록:
    ${news.map(n => `- ${n.title} (${n.date})`).join('\n')}
    ${currentNewsInfo}
    `;


    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log('Gemini 응답:', responseText);

    let issues;
    try {
        // ✅ JSON 응답 파싱
        const cleanedText = responseText.trim()
        .replace(/^```json/, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();

        issues = JSON.parse(cleanedText);
    } catch (err) {
        console.error('❌ JSON 파싱 오류:', err);
        throw new Error('응답을 JSON으로 파싱하지 못했습니다.');
    }

    if (!Array.isArray(issues) || issues.length === 0) {
        throw new Error('No valid issues could be parsed from the response');
    }

    // ✅ summaryResult에 필요한 필드 수집
    const summaryResult = {
        titles: issues.map(i => i.title || ''),
        descriptions: issues.map(i => i.description || ''),
        indicators: issues.map(i => Array.isArray(i.indicators) ? i.indicators.join(', ') : i.indicators || ''),
        impacts: issues.map(i => i.impact || '')
    };

    return summaryResult;
}

// DB에 매크로 이슈 저장
async function saveMacroIssues(titles, descriptions, indicators, impacts, representative) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const currentDate = new Date().toISOString().split('T')[0];
        
        const query = `
            INSERT INTO macro_issue 
            (summary_date, representative, summary_title, summary_detail, related_indicators, market_impact)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (summary_date, representative) 
            DO UPDATE SET 
                summary_title = $3,
                summary_detail = $4,
                related_indicators = $5,
                market_impact = $6
        `;
        
        await client.query(query, [
            currentDate,
            representative,
            titles,
            descriptions,
            indicators,
            impacts
        ]);
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// 매크로 이슈 생성 및 저장
async function generateAndSaveMacroIssues(level = '중급', currentNewsId = null) {
    console.log('=== generateAndSaveMacroIssues 시작 ===');
    console.log(`레벨: ${level}`);
    console.log(`현재 뉴스 ID: ${currentNewsId}`);
    
    try {
        const recentNews = await getRecentMacroNews(currentNewsId);
        console.log(`최근 뉴스 ${recentNews.length}개 발견`);
        
        if (recentNews.length === 0) {
            throw new Error('No recent news found');
        }

        const representative = recentNews[0].representative; // 첫 번째 뉴스의 representative 사용
        
        const summary = await generateMacroSummary(recentNews, currentNewsId);
        
        if (!summary || !summary.titles || !summary.descriptions) {
            throw new Error('요약 생성에 실패했습니다.');
        }
        
        await saveMacroIssues(
            summary.titles,
            summary.descriptions,
            summary.indicators,
            summary.impacts,
            representative
        );
        
        return true;
    } catch (error) {
        console.error('Error in generateAndSaveMacroIssues:', error);
        throw error;
    }
}
module.exports = {
    generateAndSaveMacroIssues
};