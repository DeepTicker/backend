// src/services/generateNewsThemeIn.js
const pool = require('../../config/db');
const { model } = require('../../config/gemini');
const { extractJsonBlock } = require('../utils/extractJsonBlock');

// 특정 뉴스 정보 가져오기
async function getNewsInfo(newsId) {
    if (!newsId) return null;

    const query = `
        SELECT nr.id, nr.title, nr.content, nc.category, nc.representative
        FROM news_raw nr
        JOIN news_classification nc ON nr.id = nc.news_id
        WHERE nr.id = $1
    `;

    const result = await pool.query(query, [newsId]);
    return result.rows.length > 0 ? result.rows[0] : null;
}

// 테마별 최근 뉴스 가져오기
async function getRecentThemeNews(themeName) {
    const query = `
        SELECT nr.id, nr.title, nr.content, nc.representative
        FROM news_raw nr
        JOIN news_classification nc ON nr.id = nc.news_id
        WHERE nc.category = '테마'
        AND nc.representative = $1
        AND nr.date >= CURRENT_DATE - INTERVAL '20 days'
        ORDER BY nr.date DESC
    `;

    const result = await pool.query(query, [themeName]);
    return result.rows;
}

// Gemini를 사용하여 테마 이슈 요약 생성
async function generateThemeSummary(themeName, news) {
    console.log('=== generateThemeSummary 시작 ===');
    console.log(`테마: ${themeName}`);
    console.log(`입력된 뉴스 수: ${news.length}`);

    // ✅ 뉴스 부족 시 Gemini 호출 생략 + 메시지 포함 결과 반환
    if (news.length <= 5) {
        const message = `⚠️ '${themeName}' 테마에 대한 관련 뉴스가 ${news.length}개로 적어 요약 정보를 제공하기 어렵습니다.`;
        console.warn(message);

        return {
            titles: [],
            descriptions: [],
            message
        };
    }

    // ✨ Gemini 호출 및 파싱은 그대로 진행
    const prompt = `
        ${themeName} 테마의 최근 20일간의 뉴스를 분석하여 가장 중요한 이슈 5가지를 추출해주세요.
        일반 투자자가 이해할 수 있도록 쉽게 작성해주세요.
        각 이슈는 반드시 다음 형식으로 작성해주세요:
        [
            {
                "title": "이슈 제목",
                "description": "이슈 설명 (한 문단)"
            },
            ...
        ]

        간결하고 명확하게 작성해주세요.

        분석할 뉴스:
        ${news.map(n => `- ${n.title}`).join('\n')}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log('=== Gemini API 응답 ===');
    console.log('원본 응답:', responseText);

    let issues;
    try {
        const cleanedText = extractJsonBlock(responseText); 
        issues = JSON.parse(cleanedText);
    } catch (err) {
        console.error('❌ JSON 파싱 오류:', err);
        throw new Error('JSON 파싱 실패 - generateThemeSummary');
    }

    if (!Array.isArray(issues) || issues.length === 0) {
        throw new Error('파싱된 이슈가 없습니다 - generateThemeSummary');
    }

    return {
        titles: issues.map(i => i.title || ''),
        descriptions: issues.map(i => i.description || ''),
        message: null // 정상이면 message는 null
    };
}


// DB에 테마 이슈 저장
async function saveThemeIssues(themeName, titles, descriptions) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const currentDate = new Date().toISOString().split('T')[0];

        const query = `
            INSERT INTO theme_issue 
            (theme_name, summary_date, summary_title, summary_detail)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (theme_name, summary_date) 
            DO UPDATE SET 
                summary_title = $3,
                summary_detail = $4
        `;

        await client.query(query, [
            themeName,
            currentDate,
            titles,
            descriptions
        ]);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// 테마 이슈 생성 및 저장
async function generateAndSaveThemeIssues(newsId) {
    console.log('=== generateAndSaveThemeIssues 시작 ===');
    console.log(`newsId: ${newsId}`);

    try {
        const newsInfo = await getNewsInfo(newsId);

        if (!newsInfo) {
            throw new Error('뉴스 정보를 찾을 수 없습니다.');
        }

        if (newsInfo.category === '테마' && newsInfo.representative) {
            console.log(`테마 ${newsInfo.representative} 처리 시작...`);

            const recentNews = await getRecentThemeNews(newsInfo.representative);
            console.log(`${newsInfo.representative} 테마의 최근 뉴스 ${recentNews.length}개 발견`);

            const summary = await generateThemeSummary(newsInfo.representative, recentNews);

            if (!summary || !summary.titles || !summary.descriptions) {
                throw new Error('요약 생성에 실패했습니다.');
            }

            await saveThemeIssues(newsInfo.representative, summary.titles, summary.descriptions);

            return true;
        }

        return false;
    } catch (error) {
        console.error('Error in generateAndSaveThemeIssues:', error);
        throw error;
    }
}

module.exports = {
    generateAndSaveThemeIssues
};
