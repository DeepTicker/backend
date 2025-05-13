// 예시: src/scripts/processNewsTerm.js
const pool = require('../../config/db');
const { extractTermsFromText } = require('../utils/extractAndSaveNewsTerm');
const { crawlBokDictionary, generateExplanationWithLLM, simplifyExplanation, saveNewTerm, classifyTerm } = require('../utils/addNewTerm');

async function processNewTerms() {
    console.log('🚀 뉴스 용어 처리 시작');

    try {
        // 1. 아직 처리되지 않은 뉴스 가져오기
        const query = `
            SELECT nr.id, nr.content
            FROM news_raw nr
            LEFT JOIN news_terms nt ON nr.id = nt.news_id
            WHERE nt.news_id IS NULL
            ORDER BY nr.id
        `;
        const { rows } = await pool.query(query);
        console.log(`🔍 처리할 뉴스 개수: ${rows.length}`);

        // 2. 각 뉴스에 대해 처리
        for (const row of rows) {
            console.log(`\n📰 뉴스 ID ${row.id} 처리 중...`);
            
            // 2-1. NER로 용어 추출
            const terms = await extractTermsFromText(row.content);
            console.log(`📝 추출된 용어: ${terms.length}개`);

            // 2-2. 각 용어에 대해 설명 생성 및 저장
            for (const term of terms) {
                // 이미 저장된 용어인지 확인
                const existingTerm = await pool.query(
                    'SELECT * FROM financial_terms WHERE term = $1',
                    [term]
                );

                if (existingTerm.rows.length === 0) {
                    console.log(`\n🆕 새로운 용어 발견: ${term}`);
                    
                    // BOK 사전에서 설명 검색
                    let original = await crawlBokDictionary(term);
                    
                    // BOK에서 찾지 못한 경우 Gemini로 생성
                    if (!original) {
                        console.log(`📚 BOK에서 찾지 못함, Gemini로 생성 시도...`);
                        original = await generateExplanationWithLLM(term);
                    }
                    
                    if (original) {
                        // 설명 단순화
                        const simplified = await simplifyExplanation(original);
                        
                        // 카테고리 분류
                        const category = classifyTerm(term, original);
                        
                        // DB에 저장
                        await saveNewTerm(term, simplified, original, category);
                        console.log(`✅ 용어 저장 완료: ${term}`);
                    } else {
                        console.log(`⚠️ 설명 생성 실패: ${term}`);
                    }
                }
            }

            // 2-3. news_terms 테이블에 용어 매핑 저장
            for (const term of terms) {
                const category = await pool.query(
                    'SELECT category FROM financial_terms WHERE term = $1',
                    [term]
                ).then(res => res.rows[0]?.category || '미분류');

                await pool.query(
                    'INSERT INTO news_terms(news_id, term, category) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
                    [row.id, term, category]
                );
            }
            
            console.log(`✅ 뉴스 ID ${row.id} 처리 완료`);
        }

        console.log('\n🎉 전체 뉴스 용어 처리 완료');
    } catch (err) {
        console.error('❌ 용어 처리 중 오류:', err);
    } finally {
        await pool.end();
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    processNewTerms();
}

module.exports = { processNewTerms };
