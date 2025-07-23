const pool = require('../../config/db');

async function extractEntitiesByCategory(newsId) {
    try {
        // 1. 뉴스 분류 정보 가져오기
        const classificationsQuery = `
            SELECT nc.category, 
                   CASE 
                     WHEN nc.category = '개별주' THEN ts.stock_name
                     WHEN nc.category = '전반적' THEN mcm.category_name
                     WHEN nc.category = '산업군' THEN nc.industry_name
                     WHEN nc.category = '테마' THEN nc.theme_name
                     ELSE '기타'
                   END as representative,
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
        
        const stockEntities = await extractStockNames(newsContent);
        
        const entities = [];

        for (const classification of classifications) {
            const { category, representative } = classification;
            
            let additionalEntities = [];
            
            switch (category) {
                case '전반적':
                    additionalEntities = [{ type: 'macro', name: representative }];
                    break;
                    
                case '개별주':
                    additionalEntities = [];
                    break;
                    
                case '테마':
                    additionalEntities = await extractThemeNames(newsContent);
                    break;
                    
                case '산업군':
                    additionalEntities = await extractIndustryNames(newsContent);
                    break;
            }
            
            entities.push({
                category,
                representative,
                stockEntities,
                additionalEntities
            });
        }

        return { entities, error: null };
        
    } catch (error) {
        console.error('엔티티 추출 실패:', error);
        return { entities: [], error: error.message };
    }
}

async function extractStockNames(content) {
    try {
        const { rows: stocks } = await pool.query(
            'SELECT stock_code, stock_name FROM tmp_stock ORDER BY LENGTH(stock_name) DESC'
        );
        
        const foundStocks = [];
        const processedNames = new Set();
        
        // 일단 최대 5개 제한한
        for (const stock of stocks) {
            if (foundStocks.length >= 5) break;
            
            const stockName = stock.stock_name;
            
            if (processedNames.has(stockName)) continue;
            
            if (content.includes(stockName)) {
                foundStocks.push({
                    type: 'stock',
                    code: stock.stock_code,
                    name: stockName
                });
                processedNames.add(stockName);
            }
        }
        
        return foundStocks;
        
    } catch (error) {
        console.error('주식명 추출 실패:', error);
        return [];
    }
}

async function extractThemeNames(content) {
    try {
        const { rows: themes } = await pool.query(
            'SELECT theme_name FROM theme_info ORDER BY LENGTH(theme_name) DESC'
        );
        
        const foundThemes = [];
        const processedNames = new Set();
        
        for (const theme of themes) {
            if (foundThemes.length >= 3) break;
            
            const themeName = theme.theme_name;
            
            if (processedNames.has(themeName)) continue;
            
            // 뉴스 본문에서 테마명 찾기
            if (content.includes(themeName)) {
                foundThemes.push({
                    type: 'theme',
                    name: themeName
                });
                processedNames.add(themeName);
            }
        }
        
        return foundThemes;
        
    } catch (error) {
        console.error('테마명 추출 실패:', error);
        return [];
    }
}

async function extractIndustryNames(content) {
    try {
        const { rows: industries } = await pool.query(
            'SELECT industry_name FROM industry_info ORDER BY LENGTH(industry_name) DESC'
        );
        
        const foundIndustries = [];
        const processedNames = new Set();
        
        for (const industry of industries) {
            if (foundIndustries.length >= 3) break;
            
            const industryName = industry.industry_name;
            
            if (processedNames.has(industryName)) continue;
            
            if (content.includes(industryName)) {
                foundIndustries.push({
                    type: 'industry',
                    name: industryName
                });
                processedNames.add(industryName);
            }
        }
        
        return foundIndustries;
        
    } catch (error) {
        console.error('산업군명 추출 실패:', error);
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
    
    entities.forEach(categoryData => {
        targets.stocks.push(...categoryData.stockEntities);

        categoryData.additionalEntities.forEach(entity => {
            switch (entity.type) {
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
    extractStockNames,
    extractThemeNames,
    extractIndustryNames,
    formatEntitiesForSentiment
}; 