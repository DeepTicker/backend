const pool = require('../../config/db'); // PostgreSQL 연결
require('dotenv').config();

exports.getStockGemini = async (req, res) => {
  const { stockId } = req.params;
  // console.log('📥 요청 받은 stockId:', stockId);

  try {
    const query = `
      SELECT phrase
      FROM stock_catchphrases
      WHERE stock_id = $1
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [stockId]);

    if (rows.length === 0) {
      console.warn('⚠️ 해당 stockId에 대한 캐치프레이즈 없음:', stockId);
      return res.status(404).json({ error: '해당 주식의 캐치프레이즈가 없습니다.' });
    }

    // console.log('✅ 캐치프레이즈 조회 성공:', rows[0].phrase);
    res.json({ stockId, phrase: rows[0].phrase });
  } catch (err) {
    console.error('❌ DB 오류:', err);
    res.status(500).json({ error: '캐치프레이즈 조회 중 오류 발생' });
  }
};
