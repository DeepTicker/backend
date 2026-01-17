const axios = require('axios');

class FlaskSentimentClient {
    constructor() {
        this.baseURL = 'http://127.0.0.1:5555';
        this.timeout = 30000;
        this.maxRetries = 2;
        
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    async checkHealth() {
        try {
            const response = await this.client.get('/health');
            const isHealthy = response.data.status === 'healthy' && response.data.model_loaded;
            
            if (isHealthy) {
                console.log('✅ Flask 감정분석 서버 정상 동작 중');
            } else {
                console.log('⚠️ Flask 서버는 응답하지만 모델이 로딩되지 않음');
            }
            
            return isHealthy;
            
        } catch (error) {
            console.log('❌ Flask 감정분석 서버 연결 실패:', error.message);
            return false;
        }
    }

    /**
     * 🔥 배치 감정분석 (여러 엔티티 한번에)
     * @param {Array} entities - 분석할 엔티티 목록
     * @param {string} content - 뉴스 본문
     * @param {number} confidenceThreshold
     * @returns {Promise<Object>} 분석 결과
     */
    async analyzeBatch(entities, content, confidenceThreshold = 55) {
        let attempt = 0;
        
        while (attempt < this.maxRetries) {
            try {
                console.log(`📊 배치 감정분석 시작 (시도 ${attempt + 1}/${this.maxRetries}): ${entities.length}개 엔티티`);
                
                const startTime = Date.now();
                
                const response = await this.client.post('/analyze', {
                    entities: entities,
                    content: content
                });
                
                const endTime = Date.now();
                const processingTime = endTime - startTime;
                
                if (response.data.success) {
                    const results = response.data.results || [];
                    
                    // 🎯 Confidence threshold 적용
                    const filteredResults = results.filter(result => 
                        result.confidence_score >= confidenceThreshold
                    );
                    
                    console.log(`✅ 배치 분석 완료 (${processingTime}ms)`);
                    console.log(`📈 결과: ${results.length}개 → ${filteredResults.length}개 (${confidenceThreshold}% 이상)`);
                    
                    return {
                        success: true,
                        results: filteredResults,
                        rawResults: results,  // threshold 적용 전 원본
                        stats: {
                            totalAnalyzed: results.length,
                            filteredCount: filteredResults.length,
                            processingTimeMs: processingTime,
                            confidenceThreshold: confidenceThreshold,
                            timestamp: new Date().toISOString()
                        }
                    };
                } else {
                    throw new Error(response.data.error || 'Flask 서버에서 오류 응답');
                }
                
            } catch (error) {
                attempt++;
                console.error(`❌ 배치 분석 실패 (시도 ${attempt}/${this.maxRetries}):`, error.message);
                
                if (attempt >= this.maxRetries) {
                    console.error('💥 Flask 서버 배치 분석 최종 실패');
                    return {
                        success: false,
                        error: error.message,
                        results: [],
                        stats: {
                            totalAnalyzed: 0,
                            filteredCount: 0,
                            processingTimeMs: 0,
                            confidenceThreshold: confidenceThreshold,
                            timestamp: new Date().toISOString()
                        }
                    };
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    /**
     * 단일 엔티티 감정분석
     * @param {string} entityName - 엔티티 명
     * @param {string} entityType - 엔티티 타입
     * @param {string} content - 뉴스 본문
     * @returns {Promise<Object>} 분석 결과
     */
    async analyzeSingle(entityName, entityType, content) {
        try {
            console.log(`🎯 단일 감정분석: ${entityName} (${entityType})`);
            
            const response = await this.client.post('/analyze/single', {
                entity_name: entityName,
                entity_type: entityType,
                content: content
            });
            
            if (response.data.success) {
                console.log(`✅ 단일 분석 완료: ${entityName}`);
                return {
                    success: true,
                    result: response.data.result
                };
            } else {
                throw new Error(response.data.error || 'Flask 서버에서 오류 응답');
            }
            
        } catch (error) {
            console.error(`❌ 단일 분석 실패 (${entityName}):`, error.message);
            return {
                success: false,
                error: error.message,
                result: null
            };
        }
    }

    /**
     * 엔티티 목록을 Flask 서버 형식으로 변환
     * @param {Object} formattedEntities - formatEntitiesForSentiment 결과
     * @returns {Array} Flask 서버용 엔티티 배열
     */
    formatEntitiesForFlask(formattedEntities) {
        const flaskEntities = [];
        
        // 주식
        formattedEntities.stocks.forEach(stock => {
            flaskEntities.push({
                name: stock.name,
                type: 'stock',
                code: stock.code
            });
        });
        
        // 테마
        formattedEntities.themes.forEach(theme => {
            flaskEntities.push({
                name: theme.name,
                type: 'theme'
            });
        });
        
        // 산업군
        formattedEntities.industries.forEach(industry => {
            flaskEntities.push({
                name: industry.name,
                type: 'industry'
            });
        });
        
        return flaskEntities;
    }
}

const flaskClient = new FlaskSentimentClient();


/**
 * 배치 감정분석 실행
 * @param {Object} formattedEntities - 엔티티 목록
 * @param {string} content - 뉴스 본문
 * @param {number} confidenceThreshold - 신뢰도 임계값
 * @returns {Promise<Object>} 분석 결과
 */
async function analyzeSentimentBatch(formattedEntities, content, confidenceThreshold = 60) {
    const isHealthy = await flaskClient.checkHealth();
    if (!isHealthy) {
        return {
            success: false,
            error: 'Flask 감정분석 서버가 준비되지 않음',
            results: [],
            stats: {
                totalAnalyzed: 0,
                filteredCount: 0,
                processingTimeMs: 0,
                confidenceThreshold: confidenceThreshold,
                timestamp: new Date().toISOString()
            }
        };
    }
    
    const flaskEntities = flaskClient.formatEntitiesForFlask(formattedEntities);
    
    if (flaskEntities.length === 0) {
        return {
            success: true,
            results: [],
            stats: {
                totalAnalyzed: 0,
                filteredCount: 0,
                processingTimeMs: 0,
                confidenceThreshold: confidenceThreshold,
                timestamp: new Date().toISOString()
            }
        };
    }
    
    return await flaskClient.analyzeBatch(flaskEntities, content, confidenceThreshold);
}


async function checkFlaskServerHealth() {
    return await flaskClient.checkHealth();
}

module.exports = {
    FlaskSentimentClient,
    flaskClient,
    analyzeSentimentBatch,
    checkFlaskServerHealth
}; 