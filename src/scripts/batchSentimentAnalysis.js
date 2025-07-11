const pool = require('../../config/db');
const { analyzeSentimentReal } = require('../services/realSentimentAnalyzer');

async function batchSentimentAnalysis() {
    try {
        console.log('🤖 배치 감정분석 시작...');
        
        // 1. 분석되지 않은 뉴스 목록 조회
        const unanalyzedNews = await getUnanalyzedNews();
        
        if (unanalyzedNews.length === 0) {
            console.log('✅ 분석할 새로운 뉴스가 없습니다.');
            return;
        }
        
        console.log(`📊 분석 대상 뉴스: ${unanalyzedNews.length}개`);
        
        // 2. 각 뉴스에 대해 감정분석 실행
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };
        
        for (const news of unanalyzedNews) {
            try {
                console.log(`\n🔍 뉴스 ${news.id} 분석 중: ${news.title.substring(0, 50)}...`);
                
                const result = await analyzeSentimentReal(news.id);
                
                if (result.success) {
                    results.success++;
                    console.log(`✅ 뉴스 ${news.id} 분석 완료: 엔티티 ${result.results.summary.total_entities}개, 매크로 ${result.results.summary.total_macro_industries}개`);
                } else {
                    results.failed++;
                    results.errors.push({ newsId: news.id, error: result.error });
                    console.log(`❌ 뉴스 ${news.id} 분석 실패: ${result.error}`);
                }
                
                // API 호출 간격 -> 5초초
                await new Promise(resolve => setTimeout(resolve, 5000));
                
            } catch (error) {
                results.failed++;
                results.errors.push({ newsId: news.id, error: error.message });
                console.error(`❌ 뉴스 ${news.id} 처리 중 오류:`, error);
            }
        }
        
        console.log('\n📋 배치 감정분석 완료!');
        console.log(`✅ 성공: ${results.success}개`);
        console.log(`❌ 실패: ${results.failed}개`);
        
        if (results.errors.length > 0) {
            console.log('\n🚨 실패한 뉴스 목록:');
            results.errors.forEach(err => {
                console.log(`   - 뉴스 ${err.newsId}: ${err.error}`);
            });
        }
        
    } catch (error) {
        console.error('❌ 배치 감정분석 실행 중 오류:', error);
        process.exit(1);
    }
}

async function getUnanalyzedNews() {
    const query = `
        SELECT DISTINCT nr.id, nr.title, nr.date
        FROM news_raw nr
        LEFT JOIN entity_sentiment_analysis esa ON nr.id = esa.news_id
        LEFT JOIN macro_sentiment_analysis msa ON nr.id = msa.news_id
        WHERE esa.news_id IS NULL AND msa.news_id IS NULL
        ORDER BY nr.id ASC
        LIMIT 50
    `;
    
    const { rows } = await pool.query(query);
    return rows;
}

if (require.main === module) {
    batchSentimentAnalysis()
        .then(() => {
            console.log('🎉 배치 감정분석 완료');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ 배치 감정분석 실패:', error);
            process.exit(1);
        });
}

module.exports = {
    batchSentimentAnalysis
}; 