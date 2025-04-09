const pool = require('../../config/db');

exports.getStockFactors = async (req, res) => {
  const { stockId } = req.params;

  try {
    const query = `
      SELECT 
        inc_factor_description, 
        dec_factor_description, 
        confidence_score,
        analysis_date
      FROM stock_factor_analysis
      WHERE stock_id = $1
      ORDER BY analysis_date DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [stockId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: '분석 정보 없음' });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching factor analysis:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
