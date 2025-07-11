const { analyzeSentimentReal } = require('../services/realSentimentAnalyzer');
const pool = require('../../config/db');

/**
 * 뉴스 감정분석 실행 (실제 모델 사용)
 * POST /api/sentiment/analyze/:newsId
 */
async function analyzeSentiment(req, res) {
    try {
        const { newsId } = req.params;
        
        console.log(`🎯 뉴스 ${newsId} Flask 감정분석 요청`);
        
        // 뉴스 존재 확인
        const { rows: newsRows } = await pool.query(
            'SELECT id, title FROM news_raw WHERE id = $1',
            [newsId]
        );
        
        if (newsRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '뉴스를 찾을 수 없습니다.'
            });
        }
        
        // Flask AI 감정분석 실행
        const result = await analyzeSentimentReal(newsId);
        
        if (!result.success) {
            return res.status(500).json(result);
        }
        
        res.json({
            success: true,
            data: {
                news_id: newsId,
                news_title: newsRows[0].title,
                analysis_type: 'flask_ai',
                ...result.results
            }
        });
        
    } catch (error) {
        console.error('감정분석 컨트롤러 오류:', error);
        res.status(500).json({
            success: false,
            error: '감정분석 중 오류가 발생했습니다.'
        });
    }
}

/**
 * 뉴스 감정분석 결과 조회
 * GET /api/sentiment/:newsId
 */
async function getSentimentResults(req, res) {
    try {
        const { newsId } = req.params;
        
        // 엔티티 감정분석 결과 조회
        const entityQuery = `
            SELECT 
                entity_type,
                entity_name, 
                entity_code,
                sentiment,
                confidence_score,
                reasoning,
                analyzed_at
            FROM entity_sentiment_analysis 
            WHERE news_id = $1 
            ORDER BY entity_type, confidence_score DESC
        `;
        
        // 매크로 감정분석 결과 조회
        const macroQuery = `
            SELECT 
                industry_name,
                sentiment,
                overall_impact,
                short_term_impact,
                medium_term_impact,
                long_term_impact,
                related_stocks,
                reasoning,
                analyzed_at
            FROM macro_sentiment_analysis 
            WHERE news_id = $1 
            ORDER BY ABS(overall_impact) DESC
        `;
        
        const [entityResults, macroResults] = await Promise.all([
            pool.query(entityQuery, [newsId]),
            pool.query(macroQuery, [newsId])
        ]);
        
        // 뉴스 정보도 함께 조회
        const { rows: newsRows } = await pool.query(
            'SELECT id, title, date FROM news_raw WHERE id = $1',
            [newsId]
        );
        
        if (newsRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '뉴스를 찾을 수 없습니다.'
            });
        }
        
        // 결과 분류
        const entities = {
            stocks: entityResults.rows.filter(r => r.entity_type === 'stock'),
            themes: entityResults.rows.filter(r => r.entity_type === 'theme'),
            industries: entityResults.rows.filter(r => r.entity_type === 'industry')
        };
        
        res.json({
            success: true,
            data: {
                news: newsRows[0],
                entities,
                macro: macroResults.rows,
                summary: {
                    total_entities: entityResults.rows.length,
                    total_stocks: entities.stocks.length,
                    total_themes: entities.themes.length,
                    total_industries: entities.industries.length,
                    total_macro_industries: macroResults.rows.length,
                    has_analysis: entityResults.rows.length > 0 || macroResults.rows.length > 0
                }
            }
        });
        
    } catch (error) {
        console.error('감정분석 결과 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '감정분석 결과 조회 중 오류가 발생했습니다.'
        });
    }
}

/**
 * 여러 뉴스의 감정분석 배치 실행
 * POST /api/sentiment/batch
 */
async function batchAnalyzeSentiment(req, res) {
    try {
        const { newsIds } = req.body;
        
        if (!Array.isArray(newsIds) || newsIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: '분석할 뉴스 ID 목록이 필요합니다.'
            });
        }
        
        console.log(`🔄 Flask 배치 감정분석 시작: ${newsIds.length}개 뉴스`);
        
        const results = [];
        const errors = [];
        
        // 순차 처리 (Flask 서버 안정성을 위해)
        for (const newsId of newsIds) {
            try {
                const result = await analyzeSentimentReal(newsId);
                
                if (result.success) {
                    results.push({
                        news_id: newsId,
                        success: true,
                        entities_count: result.results.entities.length,
                        macro_count: result.results.macro.length
                    });
                } else {
                    errors.push({
                        news_id: newsId,
                        error: result.error
                    });
                }
                
                // Flask 서버 부하 방지를 위한 간격
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`뉴스 ${newsId} 감정분석 실패:`, error);
                errors.push({
                    news_id: newsId,
                    error: error.message
                });
            }
        }
        
        console.log(`✅ Flask 배치 감정분석 완료: 성공 ${results.length}개, 실패 ${errors.length}개`);
        
        res.json({
            success: true,
            data: {
                total_requested: newsIds.length,
                successful: results.length,
                failed: errors.length,
                results,
                errors
            }
        });
        
    } catch (error) {
        console.error('배치 감정분석 컨트롤러 오류:', error);
        res.status(500).json({
            success: false,
            error: '배치 감정분석 중 오류가 발생했습니다.'
        });
    }
}

/**
 * 감정분석 통계 조회
 * GET /api/sentiment/stats
 */
async function getSentimentStats(req, res) {
    try {
        const entityStatsQuery = `
            SELECT 
                entity_type,
                sentiment,
                COUNT(*) as count,
                AVG(confidence_score) as avg_confidence
            FROM entity_sentiment_analysis 
            GROUP BY entity_type, sentiment
            ORDER BY entity_type, sentiment
        `;
        
        const macroStatsQuery = `
            SELECT 
                sentiment,
                COUNT(*) as count,
                AVG(ABS(overall_impact)) as avg_impact
            FROM macro_sentiment_analysis 
            GROUP BY sentiment
            ORDER BY sentiment
        `;
        
        const recentAnalysisQuery = `
            SELECT 
                DATE(analyzed_at) as analysis_date,
                COUNT(DISTINCT news_id) as news_count,
                COUNT(*) as entity_count
            FROM entity_sentiment_analysis 
            WHERE analyzed_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(analyzed_at)
            ORDER BY analysis_date DESC
        `;
        
        const [entityStats, macroStats, recentStats] = await Promise.all([
            pool.query(entityStatsQuery),
            pool.query(macroStatsQuery),
            pool.query(recentAnalysisQuery)
        ]);
        
        res.json({
            success: true,
            data: {
                entity_stats: entityStats.rows,
                macro_stats: macroStats.rows,
                recent_analysis: recentStats.rows
            }
        });
        
    } catch (error) {
        console.error('감정분석 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '통계 조회 중 오류가 발생했습니다.'
        });
    }
}

module.exports = {
    analyzeSentiment,
    getSentimentResults,
    batchAnalyzeSentiment,
    getSentimentStats
}; 