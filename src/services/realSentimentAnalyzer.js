const path = require('path');
const pool = require('../../config/db');
const { extractEntitiesByCategory, formatEntitiesForSentiment } = require('./entityExtractor');
const { generateText } = require('../../config/gemini');
const { analyzeSentimentBatch } = require('./flaskSentimentClient');


async function analyzeSentimentReal(newsId) {
    try {
        console.log(`🔍 뉴스 ${newsId} 실제 감정분석 시작...`);
        
        const isAlreadyAnalyzed = await checkIfNewsAlreadyAnalyzed(newsId);
        if (isAlreadyAnalyzed) {
            console.log(`⏭️ 뉴스 ${newsId}: 이미 감정분석이 완료되어 스킵합니다.`);
            return {
                success: true,
                results: {
                    entities: [],
                    macro: [],
                    summary: {
                        total_entities: 0,
                        total_macro_industries: 0,
                        skip_reason: 'already_analyzed'
                    }
                }
            };
        }
        
        // 1. 엔티티 추출
        const entityResult = await extractEntitiesByCategory(newsId);
        if (entityResult.error) {
            return { success: false, error: entityResult.error };
        }
        
        // 2. 감정분석 대상 포맷팅
        const targets = formatEntitiesForSentiment(entityResult.entities);
        
        // 2.1. 엔티티가 없으면 감정분석 스킵
        const totalEntities = targets.stocks.length + targets.themes.length + targets.industries.length;
        if (totalEntities === 0 && targets.macro.length === 0) {
            console.log(`⚠️ 뉴스 ${newsId}: 추출된 엔티티가 없어서 감정분석을 스킵합니다.`);
            return {
                success: true,
                results: {
                    entities: [],
                    macro: [],
                    summary: {
                        total_entities: 0,
                        total_macro_industries: 0,
                        skip_reason: 'no_entities_extracted'
                    }
                }
            };
        }
        
        // 3. 뉴스 내용 가져오기
        const { rows: newsRows } = await pool.query(
            'SELECT title, content FROM news_raw WHERE id = $1',
            [newsId]
        );
        
        if (newsRows.length === 0) {
            return { success: false, error: '뉴스를 찾을 수 없습니다.' };
        }
        
        const newsContent = newsRows[0].title + ' ' + newsRows[0].content;
        
        // 4. 엔티티별 실제 감정분석 실행 (배치 처리 + threshold 적용)
        const confidenceThreshold = 55;
        const entityResults = await analyzeEntitySentimentsReal(newsId, newsContent, targets, confidenceThreshold);
        
        // 5. 전반적 뉴스 AI 분석
        const macroResults = await analyzeMacroSentimentsReal(newsId, newsContent, targets.macro);
        
        console.log(`✅ 뉴스 ${newsId} 실제 감정분석 완료`);
        
        return {
            success: true,
            results: {
                entities: entityResults,
                macro: macroResults,
                summary: {
                    total_entities: entityResults.length,
                    total_macro_industries: macroResults.length
                }
            }
        };
        
    } catch (error) {
        console.error('실제 감정분석 실패:', error);
        return { success: false, error: error.message };
    }
}

async function checkIfNewsAlreadyAnalyzed(newsId) {
    try {
        const { rows: entityRows } = await pool.query(
            'SELECT COUNT(*) as count FROM entity_sentiment_analysis WHERE news_id = $1',
            [newsId]
        );
        
        const { rows: macroRows } = await pool.query(
            'SELECT COUNT(*) as count FROM macro_sentiment_analysis WHERE news_id = $1',
            [newsId]
        );
        
        const hasEntityAnalysis = parseInt(entityRows[0].count) > 0;
        const hasMacroAnalysis = parseInt(macroRows[0].count) > 0;
        
        return hasEntityAnalysis || hasMacroAnalysis;
        
    } catch (error) {
        console.error('뉴스 분석 상태 확인 실패:', error);
        return false;
    }
}

/**
 * 🔥 엔티티별 실제 감정분석 (Flask 배치 처리)
 * @param {number} newsId - 뉴스 ID
 * @param {string} content - 뉴스 내용
 * @param {Object} targets - 분석 대상 엔티티들
 * @param {number} confidenceThreshold
 * @returns {Array} 분석 결과 배열
 */
async function analyzeEntitySentimentsReal(newsId, content, targets, confidenceThreshold = 55) {
    const results = [];
    
    try {
        console.log(`🚀 뉴스 ${newsId} 배치 감정분석 시작...`);
        
        const batchResult = await analyzeSentimentBatch(targets, content, confidenceThreshold);
        
        if (!batchResult.success) {
            console.error('Flask 배치 분석 실패:', batchResult.error);
            return await analyzeEntitySentimentsFallback(newsId, content, targets);
        }
        
        console.log(`📊 배치 분석 결과: ${batchResult.stats.totalAnalyzed}개 → ${batchResult.stats.filteredCount}개 (${confidenceThreshold}% 이상)`);
        
        for (const flaskResult of batchResult.results) {
            let entityType, entityCode = null;
            
            if (flaskResult.entity_type === 'stock') {
                entityType = 'stock';
                const stock = targets.stocks.find(s => s.name === flaskResult.entity_name);
                entityCode = stock ? stock.code : null;
            } else if (flaskResult.entity_type === 'theme') {
                entityType = 'theme';
            } else if (flaskResult.entity_type === 'industry') {
                entityType = 'industry';
            } else {
                continue;
            }
            
            const sentiment = {
                sentiment: flaskResult.sentiment,
                confidence: flaskResult.confidence_score,
                reasoning: `${flaskResult.entity_name} 분석 결과`
            };
            
            const savedResult = await saveEntitySentiment(
                newsId, entityType, flaskResult.entity_name, entityCode, sentiment
            );
            
            if (savedResult) {
                results.push(savedResult);
            }
        }
        
        console.log(`✅ 뉴스 ${newsId} 배치 감정분석 완료: ${results.length}개 저장`);
        return results;
        
    } catch (error) {
        console.error('배치 감정분석 실패:', error);
        return await analyzeEntitySentimentsFallback(newsId, content, targets);
    }
}

/**
 * 📦 Fallback 엔티티 감정분석 (기존 개별 방식)
 * Flask 서버 실패시 사용되는 대체 방법
 */
async function analyzeEntitySentimentsFallback(newsId, content, targets) {
    console.log('⚠️ Fallback 감정분석 모드로 전환...');
    const results = [];
    
    // 간단한 키워드 기반 분석으로 대체
    const allEntities = [
        ...targets.stocks.map(s => ({...s, type: 'stock'})),
        ...targets.themes.map(t => ({...t, type: 'theme'})),
        ...targets.industries.map(i => ({...i, type: 'industry'}))
    ];
    
    for (const entity of allEntities) {
        const sentiment = getFallbackSentiment(entity.name);
        const result = await saveEntitySentiment(
            newsId, entity.type, entity.name, entity.code || null, sentiment
        );
        if (result) results.push(result);
    }
    
    return results;
}

/**
 * 전반적 뉴스 실제 Gemini AI 분석
 * @param {number} newsId - 뉴스 ID
 * @param {string} content - 뉴스 내용
 * @param {Array} macroTargets - 전반적 분석 대상
 * @returns {Array} 매크로 분석 결과
 */
async function analyzeMacroSentimentsReal(newsId, content, macroTargets) {
    if (macroTargets.length === 0) {
        return [];
    }
    
    try {
        console.log(`🤖 뉴스 ${newsId} Gemini 기반 전반적 분석 시작...`);
        
        // Gemini API로 전반적 뉴스 분석
        const affectedIndustries = await analyzeMacroWithGemini(content);
        const results = [];
        
        for (const industry of affectedIndustries) {
            const result = await saveMacroSentiment(newsId, industry);
            results.push(result);
        }
        
        console.log(`✅ Gemini 매크로 분석 완료: ${results.length}개 산업 영향`);
        return results;
        
    } catch (error) {
        console.error('Gemini 매크로 분석 실패, Mock으로 대체:', error);
        // 실패시 Mock 데이터로 대체
        const fallbackIndustries = generateMacroIndustries(content);
        const results = [];
        
        for (const industry of fallbackIndustries) {
            const result = await saveMacroSentiment(newsId, industry);
            results.push(result);
        }
        
        return results;
    }
}

/**
 * Gemini API를 사용한 전반적 뉴스의 거시경제 영향 분석
 * @param {string} content - 뉴스 내용
 * @returns {Array} 영향받는 산업군들
 */
async function analyzeMacroWithGemini(content) {
    const prompt = `다음 경제/금융 뉴스를 분석하여 국내 주식시장에 미칠 거시경제적 영향을 분석해주세요.

뉴스 내용:
${content}

다음 JSON 형식으로 영향받을 주요 산업군 2-5개를 분석해주세요:

{
  "industries": [
    {
      "name": "산업군명",
      "sentiment": "+",
      "overall_impact": 1.5,
      "short_term": 1.0,
      "medium_term": 1.8,
      "long_term": 2.2,
      "reasoning": "뉴스 내용이 해당 산업에 미치는 영향을 최대 3문장으로 간결하게 설명",
      "related_stocks": ["대표주식1", "대표주식2", "대표주식3"]
    }
  ]
}

🔥 reasoning 작성 규칙 (필수):
1. 첫 번째 문장: 뉴스의 핵심 내용이 해당 산업에 미치는 직접적 영향 설명
2. 두 번째 문장 (선택): 구체적인 수익/손실 요인 설명  
3. 세 번째 문장 (선택): 리스크나 제한사항
4. 말투 통일: "~가능성이 있음", "~우려됨", "~예상됨", "~필요함" 등으로 끝내기

예시:
- "금리 인하 정책으로 은행의 순이자마진 감소가 예상됨. 하지만 대출 수요 증가로 일부 상쇄될 가능성이 있음. 경기 회복 속도에 따라 영향도가 달라질 수 있음."

참고사항:
- sentiment: "+" (긍정) 또는 "-" (부정)
- impact 수치: -5.0 ~ +5.0 범위의 예상 주가 변동률(%)
- short_term: 1주일, medium_term: 1개월, long_term: 3개월 영향도
- 대한민국 주요 산업군: 은행, 증권, 보험, 건설, 반도체, 자동차, 항공, 화학, 바이오, 게임 등
- related_stocks: 해당 산업의 대표 상장기업명

실제 시장 상황을 고려하여 현실적인 분석을 제공해주세요.`;

    try {
        const result = await generateText(prompt);
        const responseText = result.trim();
        
        console.log('Gemini 매크로 분석 응답:', responseText);
        
        // JSON 파싱
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('JSON 형식 응답을 찾을 수 없음');
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (!parsed.industries || !Array.isArray(parsed.industries)) {
            throw new Error('industries 배열이 없음');
        }
        
        // 데이터 검증 및 정리
        return parsed.industries.map(industry => ({
            name: industry.name || '미분류',
            sentiment: industry.sentiment === '+' ? '+' : '-',
            overall_impact: Math.max(-5, Math.min(5, industry.overall_impact || 0)),
            short_term: Math.max(-5, Math.min(5, industry.short_term || 0)),
            medium_term: Math.max(-5, Math.min(5, industry.medium_term || 0)),
            long_term: Math.max(-5, Math.min(5, industry.long_term || 0)),
            reasoning: industry.reasoning || `${industry.name}에 대한 거시경제적 영향 분석`,
            related_stocks: Array.isArray(industry.related_stocks) 
                ? industry.related_stocks.slice(0, 5) 
                : [`${industry.name}대장주`]
        }));
        
    } catch (error) {
        console.error('Gemini 매크로 분석 파싱 실패:', error);
        throw error;
    }
}

/**
 * 대체 감정분석 결과 생성
 * @param {string} entityName - 엔티티명
 * @returns {Object} 기본 감정분석 결과
 */
function getFallbackSentiment(entityName) {
    return {
        sentiment: '0',
        confidence: 50,
        reasoning: `${entityName} 분석 결과`,  // 간단하게
        scores: { positive: 0.33, negative: 0.33, neutral: 0.34 }
    };
}

/**
 * Mock 전반적 뉴스에서 영향받을 산업군들 생성 (임시)
 */
function generateMacroIndustries(content) {
    const allIndustries = ['은행', '증권', '보험', '건설', '반도체', '자동차', '항공', '화학'];
    const numIndustries = Math.floor(Math.random() * 4) + 2; // 2-5개 산업
    
    // 뉴스 내용에서 핵심 키워드 추출
    const keywords = extractKeywordsFromContent(content);
    
    const shuffled = allIndustries.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, numIndustries).map(industry => {
        const sentiment = Math.random() > 0.5 ? '+' : '-';
        const baseImpact = (Math.random() * 4) + 0.5; // 0.5% ~ 4.5%
        
        // 🔥 구체적인 reasoning 생성
        const reasoning = generateMacroReasoning(industry, sentiment, keywords, content);
        
        return {
            name: industry,
            sentiment,
            overall_impact: sentiment === '+' ? baseImpact : -baseImpact,
            short_term: sentiment === '+' ? baseImpact * 0.6 : -baseImpact * 0.6,
            medium_term: sentiment === '+' ? baseImpact * 1.2 : -baseImpact * 1.2,
            long_term: sentiment === '+' ? baseImpact * 1.8 : -baseImpact * 1.8,
            reasoning: reasoning,
            related_stocks: getRelatedStocks(industry)
        };
    });
}


function extractKeywordsFromContent(content) {
    const economicKeywords = [
        '현금', '디지털', '결제', '카드', '은행', '금융', '핀테크',
        '부동산', '금리', '인플레이션', '정책', '규제', '성장', '투자',
        '수익', '매출', '실적', '전망', '상승', '하락', '개선', '악화'
    ];
    
    const foundKeywords = [];
    const contentLower = content.toLowerCase();
    
    economicKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
            foundKeywords.push(keyword);
        }
    });
    
    return foundKeywords.slice(0, 3); // 최대 3개
}

//fallback모드일때를 대비 : 근데 실제에서는 gemini api 호출 실패가 일어나면 안되기 때문에 없어야할 일,,,,
function generateMacroReasoning(industry, sentiment, keywords, content) {
    const keywordText = keywords.length > 0 ? keywords.join(', ') : '시장 변화';
    
    const reasoningTemplates = {
        '은행': {
            '+': `${keywordText} 변화로 은행 수수료 수익 확대가 예상됨. 디지털 금융 서비스 수요 증가 가능성이 있음.`,
            '-': `${keywordText} 변화로 은행 전통 수익모델 타격이 우려됨. 수익성 악화 가능성이 있음.`
        },
        '증권': {
            '+': `${keywordText} 트렌드로 거래량 증가가 예상됨. 디지털 플랫폼 수혜가 가능함.`,
            '-': `${keywordText} 변화로 거래량 감소가 우려됨. 수익성 악화 가능성이 있음.`
        },
        '보험': {
            '+': `${keywordText} 관련 보험상품 수요 증가가 예상됨. 디지털 서비스 확산 가능성이 있음.`,
            '-': `${keywordText} 변화로 전통 영업방식에 어려움이 예상됨. 수익성 타격이 우려됨.`
        },
        '건설': {
            '+': `${keywordText} 정책으로 인프라 투자 확대가 예상됨. 수주 증가 가능성이 있음.`,
            '-': `${keywordText} 변화로 자금조달 부담 증가가 우려됨. 수요 둔화 가능성이 있음.`
        },
        '반도체': {
            '+': `${keywordText} 트렌드로 반도체 수요 증가가 예상됨. 기술 발전 가속화 가능성이 있음.`,
            '-': `${keywordText} 변화로 공급망 불안정이 우려됨. 투자 위축 가능성이 있음.`
        },
        '자동차': {
            '+': `${keywordText} 관련 신기술 도입이 예상됨. 새로운 수익모델 창출 가능성이 있음.`,
            '-': `${keywordText} 변화로 전환 비용 부담이 우려됨. 경쟁력 약화 가능성이 있음.`
        }
    };
    
    if (reasoningTemplates[industry] && reasoningTemplates[industry][sentiment]) {
        return reasoningTemplates[industry][sentiment];
    } else {
        const sentimentText = sentiment === '+' ? '긍정적 영향이 예상됨' : '부정적 영향이 우려됨';
        return `${keywordText} 변화로 인한 ${industry}업계 ${sentimentText}. 시장 상황에 따라 영향도가 달라질 수 있음.`;
    }
}

function getRelatedStocks(industry) {
    const stockMap = {
        '은행': ['KB금융지주', '신한지주', '하나금융지주'],
        '증권': ['미래에셋증권', '삼성증권', '키움증권'],
        '건설': ['삼성물산', 'GS건설', 'DL이앤씨'],
        '반도체': ['삼성전자', 'SK하이닉스', '메모리솔루션'],
        '자동차': ['현대차', '기아', '현대모비스']
    };
    return stockMap[industry] || [`${industry}대장주`, `${industry}중견주`];
}


async function saveEntitySentiment(newsId, entityType, entityName, entityCode, sentiment) {
    try {
        const query = `
            INSERT INTO entity_sentiment_analysis 
            (news_id, entity_type, entity_name, entity_code, sentiment, confidence_score, reasoning)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (news_id, entity_type, entity_name) 
            DO UPDATE SET 
                sentiment = EXCLUDED.sentiment,
                confidence_score = EXCLUDED.confidence_score,
                reasoning = EXCLUDED.reasoning,
                analyzed_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const { rows } = await pool.query(query, [
            newsId, entityType, entityName, entityCode,
            sentiment.sentiment, sentiment.confidence, sentiment.reasoning
        ]);
        
        return rows[0];
        
    } catch (error) {
        console.error('엔티티 감정분석 저장 실패:', error);
        return null;
    }
}

async function saveMacroSentiment(newsId, industryData) {
    try {
        const query = `
            INSERT INTO macro_sentiment_analysis 
            (news_id, industry_name, sentiment, overall_impact, short_term_impact, 
             medium_term_impact, long_term_impact, related_stocks, reasoning)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (news_id, industry_name)
            DO UPDATE SET 
                sentiment = EXCLUDED.sentiment,
                overall_impact = EXCLUDED.overall_impact,
                short_term_impact = EXCLUDED.short_term_impact,
                medium_term_impact = EXCLUDED.medium_term_impact,
                long_term_impact = EXCLUDED.long_term_impact,
                related_stocks = EXCLUDED.related_stocks,
                reasoning = EXCLUDED.reasoning,
                analyzed_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const { rows } = await pool.query(query, [
            newsId, industryData.name, industryData.sentiment,
            industryData.overall_impact, industryData.short_term,
            industryData.medium_term, industryData.long_term,
            industryData.related_stocks, industryData.reasoning
        ]);
        
        return rows[0];
        
    } catch (error) {
        console.error('매크로 감정분석 저장 실패:', error);
        return null;
    }
}

module.exports = {
    analyzeSentimentReal,
    analyzeEntitySentimentsReal,
    analyzeEntitySentimentsFallback,
    analyzeMacroSentimentsReal,
    checkIfNewsAlreadyAnalyzed
}; 


