const pool = require('../../config/db');

exports.getStockRecoms = async (req, res) => {
  const { stockId } = req.params;

  try {
    const query = `
      SELECT
        sr.similar_stock_id,
        sd.name AS similar_stock_name,
        sr.similarity_score,
        sr.recommended_date
      FROM stock_recommendation sr
      JOIN stock_data sd
        ON sr.similar_stock_id = sd.stock_id
      WHERE sr.stock_id = $1
      ORDER BY sr.similarity_score DESC
    `;

    const { rows } = await pool.query(query, [stockId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
