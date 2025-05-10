const pool = require('../../config/db');

exports.getStockRecoms = async (req, res) => {
  const { stockId } = req.params;

  try {
    const query = `
      SELECT
        sr.stock_id,
        sr.similar_stock_id_1,
        sd1.name AS similar_stock_name_1,
        sr.similar_stock_id_2,
        sd2.name AS similar_stock_name_2,
        sr.similar_stock_id_3,
        sd3.name AS similar_stock_name_3,
        sr.marcap,
        sr.cluster_index,
        sr.cluster_name,
        sr.recommended_date
      FROM stock_recommendation sr
      LEFT JOIN stock_data sd1 ON sr.similar_stock_id_1 = sd1.stock_id
      LEFT JOIN stock_data sd2 ON sr.similar_stock_id_2 = sd2.stock_id
      LEFT JOIN stock_data sd3 ON sr.similar_stock_id_3 = sd3.stock_id
      WHERE sr.stock_id = $1
    `;

    const { rows } = await pool.query(query, [stockId]);
    res.status(200).json(rows);
    console.log('Stock recommendations fetched successfully!:', rows);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
