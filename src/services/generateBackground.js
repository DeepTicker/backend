// src/services/generateBackground.js

const pool = require('../../config/db');
const { processNewsTerms } = require('./generateNewsTerm');

// 1. 초급 레벨의 모든 카테고리에 대한 용어 설명 생성
async function generateBasicTermBackground(content) {
    // processNewsTerms 함수 사용
    const terms = await processNewsTerms(content);
    
    if (terms.knownTerms.length === 0) {
        return null;
    }

    const termExplanations = terms.knownTerms.map(term => 
        `<strong>${term.term}</strong>: ${term.explanation}`
    ).join('<br><br>');

    return `<h5>주요 경제 용어</h5>${termExplanations}`;
}

// 2. 산업군 초급 레벨의 산업 정보 생성
async function generateBasicIndustryBackground(industryName) {
    const query = `
        SELECT i.description, i.top_stocks, 
               array_agg(
                   json_build_object(
                       'code', s.stock_code,
                       'name', s.stock_name
                   ) ORDER BY s.stock_code
               ) as stock_info
        FROM industry_info i
        LEFT JOIN tmp_stock s ON s.stock_code = ANY(i.top_stocks)
        WHERE i.industry_name = $1
        GROUP BY i.description, i.top_stocks
    `;
    
    const result = await pool.query(query, [industryName]);
    if (result.rows.length === 0) {
        return null;
    }

    const { description, top_stocks, stock_info } = result.rows[0];
    console.log('Stock info:', stock_info);

    return {
        description,
        top_stocks,
        stock_info,
        html: `
            <h5>산업 개요</h5>
            <p>${description}</p>
            <h5>주요 기업</h5>
            <div class="stock-buttons">
                ${stock_info.map(stock => 
                    `<button onclick="navigateToStock('${stock.code}')">${stock.name}</button>`
                ).join('')}
            </div>
        `
    };
}

// 3. 테마 초급 레벨의 테마 정보 생성
async function generateBasicThemeBackground(themeName) {
    const query = `
        SELECT t.definition, t.beneficiaries,
               array_agg(
                   json_build_object(
                       'code', s.stock_code,
                       'name', s.stock_name
                   ) ORDER BY s.stock_code
               ) as stock_info
        FROM theme_info t
        LEFT JOIN tmp_stock s ON s.stock_code = ANY(t.beneficiaries)
        WHERE t.theme_name = $1
        GROUP BY t.definition, t.beneficiaries
    `;
    
    const result = await pool.query(query, [themeName]);
    if (result.rows.length === 0) {
        return null;
    }

    const { definition, beneficiaries, stock_info } = result.rows[0];
    console.log('Stock info:', stock_info);

    return {
        definition,
        beneficiaries,
        stock_info,
        html: `
            <h5>테마 정의</h5>
            <p>${definition}</p>
            <h5>관련 기업</h5>
            <div class="stock-buttons">
                ${stock_info.map(stock => 
                    `<button onclick="navigateToStock('${stock.code}')">${stock.name}</button>`
                ).join('')}
            </div>
        `
    };
}

// 4. 산업군 중급 레벨의 산업 이슈 요약 생성
async function generateIntermediateIndustryBackground(industryName) {
    const query = `
        SELECT summary_title, summary_detail, summary_date
        FROM industry_issue
        WHERE industry_name = $1
        ORDER BY summary_date DESC
        LIMIT 1
    `;
    
    const result = await pool.query(query, [industryName]);
    if (result.rows.length === 0) {
        return null;
    }

    const issue = result.rows[0];
    const titles = issue.summary_title;
    const descriptions = issue.summary_detail;

    // HTML 생성
    let html = `
        <h5>최근 산업 동향</h5>
        <p><small>요약일자: ${new Date(issue.summary_date).toLocaleDateString()}</small></p>
    `;

    // 각 이슈를 순서대로 HTML로 변환
    for (let i = 0; i < titles.length; i++) {
        html += `
            <div class="industry-issue">
                <h6>${titles[i]}</h6>
                <p>${descriptions[i]}</p>
            </div>
        `;
    }

    return html;
}

//5.테마 중급 레벨의 테마 이슈 요약 생성
async function generateIntermediateThemeBackground(themeName) {
    const query = `
        SELECT summary_title, summary_detail, summary_date
        FROM theme_issue
        WHERE theme_name = $1
        ORDER BY summary_date DESC
        LIMIT 1
    `;
    
    const result = await pool.query(query, [themeName]);
    if (result.rows.length === 0) {
        return null;
    }

    const issue = result.rows[0];
    const titles = issue.summary_title;
    const descriptions = issue.summary_detail;

    let html = `
        <h5>최근 테마 동향</h5>
        <p><small>요약일자: ${new Date(issue.summary_date).toLocaleDateString()}</small></p>
    `;

    for (let i = 0; i < titles.length; i++) {
        html += `
            <div class="theme-issue">
                <h6>${titles[i]}</h6>
                <p>${descriptions[i]}</p>
            </div>
        `;
    }

    return html;
}

// 6. 전반적 중급
async function generateIntermediateMacroBackground() {
    const query = `
        SELECT summary_title, summary_detail, related_indicators, market_impact, summary_date
        FROM macro_issue
        ORDER BY summary_date DESC
        LIMIT 1
    `;
    
    const result = await pool.query(query);
    if (result.rows.length === 0) {
        return null;
    }

    const issue = result.rows[0];
    const titles = issue.summary_title;
    const descriptions = issue.summary_detail;
    const indicators = issue.related_indicators;
    const impacts = issue.market_impact;

    let html = `
        <h5>최근 시장 동향</h5>
        <p><small>요약일자: ${new Date(issue.summary_date).toLocaleDateString()}</small></p>
    `;

    for (let i = 0; i < titles.length; i++) {
        html += `
            <div class="macro-issue">
                <h6>${titles[i]}</h6>
                <p>${descriptions[i]}</p>
                <p><strong>관련 지표:</strong> ${indicators[i]}</p>
                <p><strong>시장 영향:</strong> ${impacts[i]}</p>
            </div>
        `;
    }

    return html;
}

// 7. 개별 주식 중급 레벨의 주식 이슈 요약 생성
async function generateIntermediateStockBackground(representative) {
    try {
        // 1. 먼저 tmp_stock에서 stock_code 가져오기
        const stockQuery = `
            SELECT stock_code, stock_name
            FROM tmp_stock
            WHERE stock_code = $1 OR stock_name = $1
            LIMIT 1
        `;
        const stockResult = await pool.query(stockQuery, [representative]);

        if (stockResult.rows.length === 0) {
            console.log(`❗️tmp_stock에서 주식 정보를 찾을 수 없음: ${representative}`);
            return null;
        }

        const { stock_code, stock_name } = stockResult.rows[0];
        console.log(`✅ stock_code: ${stock_code}, stock_name: ${stock_name}`);

        // 2. stock_issue에서 해당 stock_code 기준으로 이슈 조회
        const issueQuery = `
            SELECT summary_title, summary_detail, 
                   related_indicators, price_impact, summary_date
            FROM stock_issue
            WHERE stock_code = $1
            ORDER BY summary_date DESC
            LIMIT 1
        `;
        const issueResult = await pool.query(issueQuery, [stock_code]);

        if (issueResult.rows.length === 0) {
            console.log(`❗️stock_issue에서 이슈를 찾을 수 없음: ${stock_code}`);
            return null;
        }

        const issue = issueResult.rows[0];
        const titles = issue.summary_title;
        const descriptions = issue.summary_detail;
        const indicators = issue.related_indicators;
        const impacts = issue.price_impact;

        let html = `
            <h5>${stock_name} 최근 이슈</h5>
            <p><small>요약일자: ${new Date(issue.summary_date).toLocaleDateString()}</small></p>
        `;

        for (let i = 0; i < titles.length; i++) {
            html += `
                <div class="stock-issue">
                    <h6>${titles[i]}</h6>
                    <p>${descriptions[i]}</p>
                    <p><strong>관련 지표:</strong> ${indicators[i] || '-'}</p>
                    <p><strong>주가 영향:</strong> ${impacts[i] || '-'}</p>
                </div>
            `;
        }

        return html;
    } catch (error) {
        console.error('주식 이슈 조회 실패:', error);
        return null;
    }
}


const termCache = { used: false, html: '' };

// 메인 함수: 카테고리와 레벨에 따라 적절한 배경지식 생성
async function generateBackground(category, level, content, representative) {
    console.log('배경지식 생성 시작:', { category, level, representative });
    let background = '';

    if (level === '초급') {
        if (!termCache.used) {
            const termBackground = await generateBasicTermBackground(content);
            if (termBackground) {
                termCache.used = true;
                termCache.html = termBackground;
                background += termBackground;
            }
        } else if (termCache.html) {
            background += ''; // 이미 추가됨
        }

        if (category === '산업군' && representative) {
            const industryBackground = await generateBasicIndustryBackground(representative);
            if (industryBackground) background += industryBackground.html;
        }

        if (category === '테마' && representative) {
            const themeBackground = await generateBasicThemeBackground(representative);
            if (themeBackground) background += themeBackground.html;
        }
    }

    // 4. 산업군 중급 레벨의 산업 이슈 요약
    if (category === '산업군' && level === '중급' && representative) {
        console.log('산업군 중급 이슈 요약 생성');
        const industryIssues = await generateIntermediateIndustryBackground(representative);
        if (industryIssues) {
            background += industryIssues;
            console.log('산업군 이슈 요약 생성 완료');
        }
    }

    // 5. 테마 중급 레벨의 테마 이슈 요약
    if (category === '테마' && level === '중급' && representative) {
        console.log('테마 중급 이슈 요약 생성');
        const themeIssues = await generateIntermediateThemeBackground(representative);
        if (themeIssues) {
            background += themeIssues;
            console.log('테마 이슈 요약 생성 완료');
        }
    }

    // 6. 전반적 중급
    // 매크로 중급 레벨의 이슈 요약
    if (category === '전반적' && level === '중급') {
        console.log('매크로 중급 이슈 요약 생성');
        const macroIssues = await generateIntermediateMacroBackground();
        if (macroIssues) {
            background += macroIssues;
            console.log('매크로 이슈 요약 생성 완료');
        }
    }

    // 7. 개별주식 중급 레벨의 주식 이슈 요약
    if (category === '개별주' && level === '중급' && representative) {
        console.log('개별주식 중급 이슈 요약 생성');
        const stockIssues = await generateIntermediateStockBackground(representative);
        if (stockIssues) {
            background += stockIssues;
            console.log('개별주식 이슈 요약 생성 완료');
        }
    }

    console.log('최종 배경지식:', background);
    return background;
}

module.exports = {
    generateBackground,
    generateBasicTermBackground,
    generateBasicIndustryBackground,
    generateBasicThemeBackground,
    generateIntermediateIndustryBackground,
    generateIntermediateThemeBackground,
    generateIntermediateMacroBackground,
    generateIntermediateStockBackground
};