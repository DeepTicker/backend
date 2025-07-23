const pool = require('../../config/db');
//classification에서 분류된 정보 가져오고 + 추가 엔티티 추출

async function extractEntitiesByCategory(newsId) {
    try {
        // 1. 뉴스 분류 정보에서 기본 엔티티들 가져오기
        const classificationsQuery = `
            SELECT nc.category, nc.stock_code, ts.stock_name,
                   nc.industry_name, nc.theme_name, 
                   nc.macro_category_code, mcm.category_name as macro_category_name,
                   nc.macro_cause, nc.macro_effect,
                   nr.title, nr.content
            FROM news_classification nc
            JOIN news_raw nr ON nc.news_id = nr.id
            LEFT JOIN tmp_stock ts ON nc.stock_code = ts.stock_code
            LEFT JOIN macro_category_master mcm ON nc.macro_category_code = mcm.category_code
            WHERE nc.news_id = $1 AND nc.category != '그 외'
        `;
        
        const { rows: classifications } = await pool.query(classificationsQuery, [newsId]);
        
        if (classifications.length === 0) {
            return { entities: [], error: '분류 정보를 찾을 수 없습니다.' };
        }

        const newsContent = classifications[0].title + ' ' + classifications[0].content;
        
        // 2. 기본 엔티티들 수집
        const baseEntities = [];
        
        for (const classification of classifications) {
            const { category, stock_code, stock_name, industry_name, theme_name, 
                    macro_category_name, macro_cause, macro_effect } = classification;
            
            switch (category) {
                case '개별주':
                    if (stock_code && stock_name) {
                        baseEntities.push({
                            type: 'stock',
                            name: stock_name,
                            code: stock_code,
                            source: 'classification'
                        });
                    }
                    break;
                    
                case '산업군':
                    if (industry_name) {
                        baseEntities.push({
                            type: 'industry',
                            name: industry_name,
                            source: 'classification'
                        });
                    }
                    break;
                    
                case '테마':
                    if (theme_name) {
                        baseEntities.push({
                            type: 'theme',
                            name: theme_name,
                            source: 'classification'
                        });
                    }
                    break;
                    
                case '전반적':
                    if (macro_category_name) {
                        baseEntities.push({
                            type: 'macro',
                            name: macro_category_name,
                            cause: macro_cause,
                            effect: macro_effect,
                            source: 'classification'
                        });
                    }
                    break;
            }
        }
        
        // 3. 추가 엔티티 추출 (threshold 60%)
        const additionalStocks = await extractAdditionalStockNames(newsContent, baseEntities, 60);
        const additionalThemes = await extractAdditionalThemeNames(newsContent, baseEntities, 60);
        const additionalIndustries = await extractAdditionalIndustryNames(newsContent, baseEntities, 60);
        
        // 4. 모든 엔티티 합치기
        const allEntities = [
            ...baseEntities,
            ...additionalStocks,
            ...additionalThemes,
            ...additionalIndustries
        ];

        return { entities: allEntities, error: null };
        
    } catch (error) {
        console.error('엔티티 추출 실패:', error);
        return { entities: [], error: error.message };
    }
}

// 추가 주식 엔티티 추출 (기본 엔티티 제외, threshold 적용)
async function extractAdditionalStockNames(content, baseEntities, threshold = 60) {
    try {
        const { rows: stocks } = await pool.query(
            'SELECT stock_code, stock_name FROM tmp_stock ORDER BY LENGTH(stock_name) DESC'
        );
        
        // 기존에 분류된 주식들 제외
        const existingStockCodes = baseEntities
            .filter(e => e.type === 'stock')
            .map(e => e.code);
        
        const foundStocks = [];
        const processedNames = new Set();
        
        for (const stock of stocks) {
            if (foundStocks.length >= 5) break;
            
            const stockName = stock.stock_name;
            const stockCode = stock.stock_code;
            
            // 이미 분류된 주식이면 스킵
            if (existingStockCodes.includes(stockCode)) continue;
            if (processedNames.has(stockName)) continue;
            
            // 본문에서 해당 주식명이 언급되는 강도 계산
            const nameOccurrences = (content.match(new RegExp(stockName, 'g')) || []).length;
            const codeOccurrences = (content.match(new RegExp(stockCode, 'g')) || []).length;
            const totalOccurrences = nameOccurrences + codeOccurrences;
            
            // threshold 기반 필터링: 본문에서 2번 이상 언급되거나 중요한 위치에 있는 경우
            const isRelevant = totalOccurrences >= 2 || 
                             content.indexOf(stockName) < content.length * 0.3; // 앞부분에 언급
            
            if (isRelevant) {
                const relevanceScore = Math.min(100, (totalOccurrences * 20) + 
                    (content.indexOf(stockName) < content.length * 0.3 ? 20 : 0));
                
                if (relevanceScore >= threshold) {
                    foundStocks.push({
                        type: 'stock',
                        code: stockCode,
                        name: stockName,
                        source: 'extracted',
                        relevance_score: relevanceScore
                    });
                    processedNames.add(stockName);
                }
            }
        }
        
        return foundStocks;
        
    } catch (error) {
        console.error('추가 주식명 추출 실패:', error);
        return [];
    }
}

// 추가 테마 엔티티 추출
async function extractAdditionalThemeNames(content, baseEntities, threshold = 60) {
    try {
        const { rows: themes } = await pool.query(
            'SELECT theme_name FROM theme_info ORDER BY LENGTH(theme_name) DESC'
        );
        
        const existingThemeNames = baseEntities
            .filter(e => e.type === 'theme')
            .map(e => e.name);
        
        const foundThemes = [];
        const processedNames = new Set();
        
        for (const theme of themes) {
            if (foundThemes.length >= 3) break;
            
            const themeName = theme.theme_name;
            
            if (existingThemeNames.includes(themeName)) continue;
            if (processedNames.has(themeName)) continue;
            
            const occurrences = (content.match(new RegExp(themeName, 'g')) || []).length;
            const isRelevant = occurrences >= 2 || content.indexOf(themeName) < content.length * 0.3;
            
            if (isRelevant) {
                const relevanceScore = Math.min(100, (occurrences * 25) + 
                    (content.indexOf(themeName) < content.length * 0.3 ? 25 : 0));
                
                if (relevanceScore >= threshold) {
                    foundThemes.push({
                        type: 'theme',
                        name: themeName,
                        source: 'extracted',
                        relevance_score: relevanceScore
                    });
                    processedNames.add(themeName);
                }
            }
        }
        
        return foundThemes;
        
    } catch (error) {
        console.error('추가 테마명 추출 실패:', error);
        return [];
    }
}

// 추가 산업군 엔티티 추출
async function extractAdditionalIndustryNames(content, baseEntities, threshold = 60) {
    try {
        const { rows: industries } = await pool.query(
            'SELECT industry_name FROM industry_info ORDER BY LENGTH(industry_name) DESC'
        );
        
        const existingIndustryNames = baseEntities
            .filter(e => e.type === 'industry')
            .map(e => e.name);
        
        const foundIndustries = [];
        const processedNames = new Set();
        
        for (const industry of industries) {
            if (foundIndustries.length >= 3) break;
            
            const industryName = industry.industry_name;
            
            if (existingIndustryNames.includes(industryName)) continue;
            if (processedNames.has(industryName)) continue;
            
            const occurrences = (content.match(new RegExp(industryName, 'g')) || []).length;
            const isRelevant = occurrences >= 2 || content.indexOf(industryName) < content.length * 0.3;
            
            if (isRelevant) {
                const relevanceScore = Math.min(100, (occurrences * 25) + 
                    (content.indexOf(industryName) < content.length * 0.3 ? 25 : 0));
                
                if (relevanceScore >= threshold) {
                    foundIndustries.push({
                        type: 'industry',
                        name: industryName,
                        source: 'extracted',
                        relevance_score: relevanceScore
                    });
                    processedNames.add(industryName);
                }
            }
        }
        
        return foundIndustries;
        
    } catch (error) {
        console.error('추가 산업군명 추출 실패:', error);
        return [];
    }
}


function formatEntitiesForSentiment(entities) {
    const targets = {
        stocks: [],
        themes: [],
        industries: [],
        macro: []
    };
    
    entities.forEach(entity => {
        switch (entity.type) {
            case 'stock':
                targets.stocks.push(entity);
                break;
            case 'theme':
                targets.themes.push(entity);
                break;
            case 'industry':
                targets.industries.push(entity);
                break;
            case 'macro':
                targets.macro.push(entity);
                break;
        }
    });
    
    targets.stocks = removeDuplicates(targets.stocks, 'code');
    targets.themes = removeDuplicates(targets.themes, 'name');
    targets.industries = removeDuplicates(targets.industries, 'name');
    targets.macro = removeDuplicates(targets.macro, 'name');
    
    return targets;
}

function removeDuplicates(array, key) {
    const seen = new Set();
    return array.filter(item => {
        const value = item[key];
        if (seen.has(value)) {
            return false;
        }
        seen.add(value);
        return true;
    });
}

module.exports = {
    extractEntitiesByCategory,
    extractAdditionalStockNames,
    extractAdditionalThemeNames,
    extractAdditionalIndustryNames,
    formatEntitiesForSentiment
}; 