const pool = require('../../config/db');

exports.getStockPrediction = async (req, res) => {
  const { stockId } = req.params;

  try {
    const query = `
      SELECT 
        predicted_date,
        predicted_close,
        confidence_score,
        var,
        conditional_var
      FROM stock_prediction
      WHERE stock_id = $1
      ORDER BY predicted_date ASC
    `;

    const { rows } = await pool.query(query, [stockId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching stock predictions:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
