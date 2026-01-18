// src/services/generateNewsIndustryIn.js
// 뉴스가 산업군-industry_name : 해당 날짜 기준 최근 20일의 이슈를 요약 제공
const pool = require('../../config/db');
const { generateText } = require('../../config/gemini');
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
// Gemini를 사용하여 산업군 이슈 요약 생성
async function generateIndustrySummary(industryName, news) {
    console.log('=== generateIndustrySummary 시작 ===');
    console.log(`산업군: ${industryName}`);
    console.log(`입력된 뉴스 수: ${news.length}`);
    console.log('첫 번째 뉴스 샘플:', news[0]);

    // 뉴스 부족 시 생략
    if (news.length <= 5) {
        const msg = `'${industryName}' 산업군의 최근 뉴스가 ${news.length}개로 적어 요약할 수 없습니다.`;
        console.warn('⚠️', msg);
        return {
            titles: [],
            descriptions: [],
            message: msg
        };
    }

    const prompt = `
${industryName} 산업군의 최근 20일간 뉴스를 분석하여 가장 중요한 이슈 5가지를 추출해주세요.

아래와 같은 JSON 형식으로 출력해주세요:
[
  {
    "title": "이슈 제목",
    "description": "이슈 설명 (핵심만 2-3문장으로 서술)"
  },
  ...
]

간결하고 명확하게 작성해주세요. 고등학생~대학생 수준으로 이해할 수 있도록 설명해주세요.

분석할 뉴스:
${news.map(n => `- ${n.title} (${n.published_at})`).join('\n')}
    `;

    console.log('=== Gemini API 호출 시작 ===');
    console.log('프롬프트:', prompt);

    const responseText = await generateText(prompt);

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
        throw new Error('파싱된 이슈가 없습니다 - generateIndustrySummary');
    }

    const summaryTitles = issues.map(i => i.title || '');
    const summaryDetails = issues.map(i => i.description || '');

    return {
        titles: summaryTitles,
        descriptions: summaryDetails,
        message: null
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
async function generateAndSaveIndustryIssues(newsId) {
    console.log('=== generateAndSaveIndustryIssues 시작 ===');
    console.log(`newsId: ${newsId}`);

    try {
        const newsInfo = await getNewsInfo(newsId);
        if (!newsInfo) {
            throw new Error('뉴스 정보를 찾을 수 없습니다.');
        }

        if (newsInfo.category === '산업군' && newsInfo.representative) {
            const recentNews = await getRecentIndustryNews(newsInfo.representative);
            const summary = await generateIndustrySummary(newsInfo.representative, recentNews);

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
