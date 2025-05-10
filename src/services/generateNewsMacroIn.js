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
        최근 20일간의 경제/시장 뉴스를 분석하여 가장 중요한 이슈 5가지를 추출해주세요.
        일반 투자자가 이해할 수 있는 수준으로 설명해주세요.
        
        ${currentNewsInfo}
        
        반드시 다음 형식으로 작성해주세요:
        
        이슈 1:
        - 이슈 제목: [제목]
        - 이슈 설명: [설명]
        - 관련 지표: [지표]
        - 시장 영향: [영향]
        
        이슈 2:
        - 이슈 제목: [제목]
        - 이슈 설명: [설명]
        - 관련 지표: [지표]
        - 시장 영향: [영향]
        
        (이하 이슈 3, 4, 5도 동일한 형식으로 작성)
        
        분석할 뉴스:
        ${news.map(n => `- ${n.title} (${n.date})`).join('\n')}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log('Gemini 응답:', responseText); // 디버깅을 위한 로그 추가
    
    // 응답 파싱
    const issues = [];
    const lines = responseText.split('\n');
    
    let currentIssue = null;
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (trimmedLine.startsWith('이슈')) {
            if (currentIssue && Object.keys(currentIssue).length > 0) {
                issues.push(currentIssue);
            }
            currentIssue = {
                title: '',
                description: '',
                indicators: '',
                impact: ''
            };
        } else if (trimmedLine.startsWith('- 이슈 제목:')) {
            currentIssue.title = trimmedLine.replace('- 이슈 제목:', '').trim();
        } else if (trimmedLine.startsWith('- 이슈 설명:')) {
            currentIssue.description = trimmedLine.replace('- 이슈 설명:', '').trim();
        } else if (trimmedLine.startsWith('- 관련 지표:')) {
            currentIssue.indicators = trimmedLine.replace('- 관련 지표:', '').trim();
        } else if (trimmedLine.startsWith('- 시장 영향:')) {
            currentIssue.impact = trimmedLine.replace('- 시장 영향:', '').trim();
        } else if (currentIssue && currentIssue.description) {
            // 설명이 여러 줄인 경우
            currentIssue.description += ' ' + trimmedLine;
        }
    }
    
    if (currentIssue && Object.keys(currentIssue).length > 0) {
        issues.push(currentIssue);
    }

    console.log('파싱된 이슈:', issues); // 디버깅을 위한 로그 추가

    if (issues.length === 0) {
        throw new Error('No valid issues could be parsed from the response');
    }

    const summaryResult = {
        titles: [],
        descriptions: [],
        indicators: [],
        impacts: []
    };

    issues.forEach((issue) => {
        if (issue.title && issue.description) {
            summaryResult.titles.push(issue.title);
            summaryResult.descriptions.push(issue.description);
            summaryResult.indicators.push(issue.indicators || '');
            summaryResult.impacts.push(issue.impact || '');
        }
    });

    if (summaryResult.titles.length === 0) {
        throw new Error('No valid issues could be parsed from the response');
    }

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