// src/services/generateNewsIndustryIn.js
// 뉴스가 산업군-industry_name : 해당 날짜 기준 최근 20일의 이슈를 요약 제공
const pool = require('../../config/db');
const { model } = require('../../config/gemini');

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

// 산업군별 최근 뉴스 가져오기
async function getRecentIndustryNews(industryName) {
    const query = `
        SELECT nr.id, nr.title, nr.content, nc.representative, nr.date AS published_at
        FROM news_raw nr
        JOIN news_classification nc ON nr.id = nc.news_id
        WHERE nc.category = '산업군'
        AND nc.representative = $1
        AND nr.date >= CURRENT_DATE - INTERVAL '20 days'
        ORDER BY nr.date DESC
    `;

    const result = await pool.query(query, [industryName]);
    return result.rows;
}

// Gemini를 사용하여 산업군 이슈 요약 생성
async function generateIndustrySummary(industryName, news, level = '중급') {
    console.log('=== generateIndustrySummary 시작 ===');
    console.log(`산업군: ${industryName}, 레벨: ${level}`);
    console.log(`입력된 뉴스 수: ${news.length}`);
    console.log('첫 번째 뉴스 샘플:', news[0]);

    let levelInstruction = '';
    switch(level) {
        case '초급':
            levelInstruction = '초보자도 이해할 수 있도록 쉽게 설명해주세요.';
            break;
        case '고급':
            levelInstruction = '전문가 수준의 심층적인 분석을 제공해주세요.';
            break;
        default:
            levelInstruction = '일반 투자자가 이해할 수 있는 수준으로 설명해주세요.';
    }

    const prompt = `
        ${industryName} 산업군의 최근 20일간의 뉴스를 분석하여 가장 중요한 이슈 5가지를 추출해주세요.
        ${levelInstruction}

        각 이슈는 다음 형식으로 작성해주세요:
        - 이슈 제목: 간단명료한 제목
        - 이슈 설명: 1-2 문장으로 된 설명. 고등학교-대학생 수준의 설명.

        분석할 뉴스:
        ${news.map(n => `- ${n.title} (${n.published_at})`).join('\n')}
    `;

    console.log('=== Gemini API 호출 시작 ===');
    console.log('프롬프트:', prompt);

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log('=== Gemini API 응답 ===');
    console.log('원본 응답:', responseText);

    // 유연한 정규표현식 파서로 변경
    const titleMatches = [...responseText.matchAll(/[-•\d.]?\s*이슈 제목\s*[:：]\s*(.+)/g)];
    const detailMatches = [...responseText.matchAll(/[-•\d.]?\s*이슈 설명\s*[:：]\s*(.+)/g)];

    if (titleMatches.length === 0 || detailMatches.length === 0 || titleMatches.length !== detailMatches.length) {
        throw new Error('No issues could be parsed from the response');
    }

    const summaryTitles = titleMatches.map(m => m[1].trim());
    const summaryDetails = detailMatches.map(m => m[1].trim());

    console.log('=== 파싱된 이슈 ===');
    console.log('이슈 수:', summaryTitles.length);
    console.log('첫 번째 이슈:', summaryTitles[0], summaryDetails[0]);

    return {
        titles: summaryTitles,
        descriptions: summaryDetails
    };
}

// DB에 산업군 이슈 저장
async function saveIndustryIssues(industryName, titles, descriptions) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const currentDate = new Date().toISOString().split('T')[0];

        const query = `
            INSERT INTO industry_issue 
            (industry_name, summary_date, summary_title, summary_detail)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (industry_name, summary_date) 
            DO UPDATE SET 
                summary_title = $3,
                summary_detail = $4
        `;

        await client.query(query, [
            industryName,
            currentDate,
            titles,
            descriptions
        ]);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('=== saveIndustryIssues 오류 ===');
        console.error('오류 메시지:', error.message);
        console.error('스택 트레이스:', error.stack);
        throw error;
    } finally {
        client.release();
    }
}

// 산업군 이슈 생성 및 저장 - 파라미터 활용 버전
async function generateAndSaveIndustryIssues(newsId, level) {
    console.log('=== generateAndSaveIndustryIssues 시작 ===');
    console.log(`newsId: ${newsId}, level: ${level}`);

    try {
        const newsInfo = await getNewsInfo(newsId);
        if (!newsInfo) {
            throw new Error('뉴스 정보를 찾을 수 없습니다.');
        }

        if (newsInfo.category === '산업군' && newsInfo.representative) {
            const recentNews = await getRecentIndustryNews(newsInfo.representative);
            const summary = await generateIndustrySummary(newsInfo.representative, recentNews, level);

            if (!summary || !summary.titles || !summary.descriptions) {
                throw new Error('요약 생성에 실패했습니다.');
            }

            await saveIndustryIssues(newsInfo.representative, summary.titles, summary.descriptions);
            return true;
        }

        return false;
    } catch (error) {
        console.error('=== generateAndSaveIndustryIssues 오류 ===');
        console.error('오류 메시지:', error.message);
        console.error('스택 트레이스:', error.stack);
        throw error;
    }
}

module.exports = {
    generateAndSaveIndustryIssues
};
