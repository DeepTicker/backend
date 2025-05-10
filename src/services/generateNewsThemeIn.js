// src/services/generateNewsThemeIn.js
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
async function generateThemeSummary(themeName, news, level = '중급') {
    console.log('=== generateThemeSummary 시작 ===');
    console.log(`테마: ${themeName}, 레벨: ${level}`);
    console.log(`입력된 뉴스 수: ${news.length}`);

    let levelInstruction = '';
    switch(level) {
        case '초급':
            levelInstruction = '초보자도 이해할 수 있도록 쉽게 설명해주세요.';
            break;
        case '고급':
            levelInstruction = '전문가 수준의 심층적인 분석을 제공해주세요.';
            break;
        default: // 중급
            levelInstruction = '일반 투자자가 이해할 수 있는 수준으로 설명해주세요.';
    }

    const prompt = `
        ${themeName} 테마의 최근 20일간의 뉴스를 분석하여 가장 중요한 이슈 5가지를 추출해주세요.
        ${levelInstruction}
        
        각 이슈는 다음 형식으로 작성해주세요:
        - 이슈 제목: 간단명료한 제목
        - 이슈 설명: 1-2 문장으로 된 설명. 고등학교-대학생 수준의 설명.
        
        분석할 뉴스:
        ${news.map(n => `- ${n.title} (${n.published_at})`).join('\n')}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // 응답 파싱
    const issues = [];
    const lines = responseText.split('\n');
    
    let currentTitle = '';
    let currentDescription = '';
    
    for (const line of lines) {
        if (line.startsWith('- **이슈 제목:**')) {
            if (currentTitle && currentDescription) {
                issues.push({
                    title: currentTitle.trim(),
                    description: currentDescription.trim()
                });
            }
            currentTitle = line.replace('- **이슈 제목:**', '').trim();
            currentDescription = '';
        } else if (line.startsWith('- **이슈 설명:**')) {
            currentDescription = line.replace('- **이슈 설명:**', '').trim();
        } else if (currentDescription && line.trim()) {
            currentDescription += ' ' + line.trim();
        }
    }
    
    if (currentTitle && currentDescription) {
        issues.push({
            title: currentTitle.trim(),
            description: currentDescription.trim()
        });
    }

    if (issues.length === 0) {
        throw new Error('No issues could be parsed from the response');
    }

    const summaryResult = {
        titles: [],
        descriptions: []
    };

    issues.forEach((issue) => {
        summaryResult.titles.push(issue.title);
        summaryResult.descriptions.push(issue.description);
    });

    return summaryResult;
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
async function generateAndSaveThemeIssues(newsId, level) {
    console.log('=== generateAndSaveThemeIssues 시작 ===');
    console.log(`newsId: ${newsId}, level: ${level}`);
    
    try {
        const newsInfo = await getNewsInfo(newsId);
        
        if (!newsInfo) {
            throw new Error('뉴스 정보를 찾을 수 없습니다.');
        }

        if (newsInfo.category === '테마' && newsInfo.representative) {
            console.log(`테마 ${newsInfo.representative} 처리 시작...`);
            
            const recentNews = await getRecentThemeNews(newsInfo.representative);
            console.log(`${newsInfo.representative} 테마의 최근 뉴스 ${recentNews.length}개 발견`);
            
            const summary = await generateThemeSummary(newsInfo.representative, recentNews, level);
            
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