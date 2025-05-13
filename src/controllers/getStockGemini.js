const pool = require('../../config/db'); // PostgreSQL 연결
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

console.log('🔧 Gemini API Key:', process.env.GEMINI_API_KEY ? 'Loaded' : 'Missing');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.getStockGemini = async (req, res) => {
  const {stockId} = req.params;
  console.log('📥 요청 받은 stockId:', stockId);

  try {
    const query = `
      SELECT predict_day, predicted_close
      FROM stock_prediction_result
      WHERE stock_id = $1
      ORDER BY predict_day ASC
    `;
    const { rows } = await pool.query(query, [stockId]);
    console.log('📊 쿼리 결과:', rows.length, '건');

    if (rows.length === 0) {
      console.warn('⚠️ 해당 stockId에 대한 예측 데이터 없음:', stockId);
      return res.status(404).json({ error: '해당 주식 예측 데이터가 없습니다.' });
    }

    const chunks = [];
    for (let i = 0; i < rows.length; i += 5) {
      chunks.push(rows.slice(i, i + 5));
    }
    
    let formatted = '';
    // 각 5일 간격의 데이터를 처리하여 프롬프트 생성
    for (let chunk of chunks) {
      const formatted = chunk.map(r => `${r.predict_day}: ${r.predicted_close}`).join('\n');
    }
    const prompt = `${formatted}\n\n위 5일치 예측 주가 데이터를 기반으로 재치있는 캐치프레이즈를 써줘.`;

    console.log('📝 Gemini 프롬프트 생성 완료:\n', formatted);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    console.log('🚀 Gemini 모델 호출 준비 완료');

    TimeRanges.sleep(1000); // 1초 대기

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('✅ Gemini 응답 수신 완료');

    res.json({ result: text });
  } catch (err) {
    console.error('❌ Gemini 오류:', err);
    res.status(500).json({ error: 'Gemini API 호출 실패' });
  }
};
