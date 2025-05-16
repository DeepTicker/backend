// src/services/generateBackground.js

const pool = require('../../config/db');
const { processNewsTerms } = require('./generateNewsTerm');
const { generateSimilarNewsInsight } = require('./generateSimilarNewsInsight');
const { getStockChanges } = require('../scripts/getStockChangeFromNews');
const dayjs = require('dayjs');

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

    // Split stock info into initial and remaining stocks
    const initialStocks = stock_info.slice(0, 5);
    const remainingStocks = stock_info.slice(5);

    return {
        description,
        top_stocks,
        stock_info,
        html: `
            <h5>산업 개요</h5>
            <p>${description}</p>
            <h5>주요 기업</h5>
            <div class="stock-buttons" data-remaining='${JSON.stringify(remainingStocks)}'>
                ${initialStocks.map(stock => 
                    `<button onclick="navigateToStock('${stock.code}')">${stock.name}</button>`
                ).join('')}
                ${remainingStocks.length > 0 ? 
                    `<button class="show-more-stocks">+</button>` 
                    : ''}
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

    // Split stock info into initial and remaining stocks
    const initialStocks = stock_info.slice(0, 5);
    const remainingStocks = stock_info.slice(5);

    return {
        definition,
        beneficiaries,
        stock_info,
        html: `
            <h5>테마 정의</h5>
            <p>${definition}</p>
            <h5>관련 기업</h5>
            <div class="stock-buttons" data-remaining='${JSON.stringify(remainingStocks)}'>
                ${initialStocks.map(stock => 
                    `<button onclick="navigateToStock('${stock.code}')">${stock.name}</button>`
                ).join('')}
                ${remainingStocks.length > 0 ? 
                    `<button class="show-more-stocks">+</button>` 
                    : ''}
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
        const msg = `'${industryName}' 산업군의 최근 뉴스가 부족하여 정보를 제공할 수 없습니다.`;
        return {
            html: `<p class="message">${msg}</p>`,
            message: msg
        };
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

    return {
        html,
        message: null
    };
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
        const msg = `⚠ '${themeName}' 테마는 관련 뉴스가 부족하여 정보를 제공할 수 없습니다.`;
        return {
            html: `<p class="message">${msg}</p>`,
            message: msg
        };
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

    return {
        html,
        message: null
    };
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

// 고급 레벨 배경지식 생성을 위한 새로운 함수들
async function generateAdvancedStockBackground(stockCode, newsDate, newsText) {
    try {
        const stockChanges = await getStockChanges(newsDate, [stockCode]);
        if (!stockChanges || stockChanges.length === 0) {
            const msg = `'${stockCode}' 종목의 주가 데이터를 조회할 수 없습니다.`;
            return {
                html: `<p class="message">${msg}</p>`,
                message: msg,
                stockData: null,
                gptAnalysis: null
            };
        }

        const similarNewsInsights = await generateSimilarNewsInsight(newsText);
        const prompt = createStockAnalysisPrompt(newsText, stockChanges[0], similarNewsInsights);
        const gptResult = await callGPT(prompt);

        const stockData = stockChanges[0];
        let html = `
            <div class="advanced-stock-analysis">
                <h5>${stockData.stockName} 심층 분석</h5>
                <div class="stock-price-changes">
                    <h6>주가 변동</h6>
                    <p>기준일: ${new Date(stockData.date).toLocaleDateString()}</p>
                    <ul>
                        <li>전일대비: ${stockData.priceChange}%</li>
                        <li>거래량: ${stockData.volume.toLocaleString()}주</li>
                        <li>시가총액: ${stockData.marketCap ? (stockData.marketCap / 100000000).toFixed(2) : '-'}억원</li>
                    </ul>
                </div>`;

        if (similarNewsInsights && similarNewsInsights.length > 0) {
            html += `
                <div class="similar-news-analysis">
                    <h6>유사 뉴스 분석</h6>`;
            for (const insight of similarNewsInsights) {
                html += `
                    <div class="similar-news-item">
                        <p class="past-news-title">${insight.past_title} (${insight.past_date})</p>
                        <p class="stock-changes">주가 변화: ${Object.entries(insight.change_summary)
                            .map(([key, value]) => `${key}: ${value}%`)
                            .join(', ')}</p>
                        <p class="gpt-insight">${insight.gpt_insight}</p>
                    </div>`;
            }
            html += `</div>`;
        }

        html += `
                <div class="gpt-analysis">
                    <h6>AI 분석</h6>
                    ${gptResult}
                </div>
            </div>`;

        return {
            html,
            message: null,
            stockData,
            gptAnalysis: gptResult,
            similarNewsInsights
        };
    } catch (error) {
        console.error('고급 주식 배경지식 생성 실패:', error);
        const msg = `'${stockCode}' 종목 분석 중 오류가 발생했습니다.`;
        return {
            html: `<p class="message">${msg}</p>`,
            message: msg,
            stockData: null,
            gptAnalysis: null,
            similarNewsInsights: null
        };
    }
}


// 프롬프트 생성 함수 수정
function createStockAnalysisPrompt(newsText, stockData, similarNewsInsights) {
    let prompt = `
        다음은 ${stockData.stockName}(${stockData.stockCode}) 관련 뉴스와 주가 데이터입니다.

        [현재 뉴스]
        ${newsText}

        [현재 주가 데이터]
        - 기준일: ${stockData.date}
        - 전일대비: ${stockData.priceChange}%
        - 거래량: ${stockData.volume.toLocaleString()}주
        - 시가총액: ${stockData.marketCap ? (stockData.marketCap / 100000000).toFixed(2) : '-'}억원`;

    if (similarNewsInsights && similarNewsInsights.length > 0) {
        prompt += `\n\n[과거 유사 뉴스 분석]`;
        for (const insight of similarNewsInsights) {
            prompt += `
            - ${insight.past_title} (${insight.past_date})
              주가 변화: ${Object.entries(insight.change_summary)
                .map(([key, value]) => `${key}: ${value}%`)
                .join(', ')}
              분석: ${insight.gpt_insight}`;
        }
    }

    prompt += `

        위 정보를 바탕으로 다음을 분석해주세요:
        1. 현재 뉴스가 주가에 미칠 영향 (과거 유사 사례 참고)
        2. 향후 주가 전망 (과거 패턴 기반)
        3. 투자 시 고려사항

        각 항목은 간단명료하게 작성해주세요.
        과거 유사 사례가 있다면, 그 경험을 바탕으로 더 구체적인 분석을 제공해주세요.`;

    return prompt;
}


// 메인 함수: 카테고리와 레벨에 따라 적절한 배경지식 생성
async function generateBackground(category, level, content, representative, newsDate = null) {
    console.log('배경지식 생성 시작:', { category, level, representative, newsDate });
    let background = '';
    let message = null;
    let advancedData = null;

    // 고급 레벨 처리
    if (level === '고급' && newsDate) {
        if (category === '개별주' && representative) {
            const result = await generateAdvancedStockBackground(representative, newsDate, content);
            if (result) {
                background = result.html;
                advancedData = {
                    stockData: result.stockData,
                    gptAnalysis: result.gptAnalysis
                };
                message = result.message;
            }
        } else {
            // 산업군이나 다른 카테고리는 중급 레벨로 처리
            if (category === '산업군' && representative) {
                const result = await generateIntermediateIndustryBackground(representative);
                if (result) {
                    background = result.html;
                    message = result.message;
                }
            } else if (category === '테마' && representative) {
                const result = await generateIntermediateThemeBackground(representative);
                if (result) {
                    background = result.html;
                    message = result.message;
                }
            } else if (category === '전반적') {
                background = await generateIntermediateMacroBackground();
            }
        }
    } else {
        // 기존 중급/초급 레벨 처리
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
                background += industryIssues.html;
                message = industryIssues.message;
                console.log('산업군 이슈 요약 생성 완료');
            }
        }

        // 5. 테마 중급 레벨의 테마 이슈 요약
        if (category === '테마' && level === '중급' && representative) {
            console.log('테마 중급 이슈 요약 생성');
            const themeIssues = await generateIntermediateThemeBackground(representative);
            if (themeIssues) {
                background += themeIssues.html;
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
    }

    console.log('최종 배경지식:', { background, message, advancedData });
    return { background, message, advancedData };
}

module.exports = {
    generateBackground,
    generateBasicTermBackground,
    generateBasicIndustryBackground,
    generateBasicThemeBackground,
    generateIntermediateIndustryBackground,
    generateIntermediateThemeBackground,
    generateIntermediateMacroBackground,
    generateIntermediateStockBackground,
    generateAdvancedStockBackground
};