const pool = require('../../config/db');

exports.getStockPrediction = async (req, res) => {
  const { stockId } = req.params;

  try {
    const query = `
      SELECT predict_day, predicted_close
      FROM stock_prediction_result
      WHERE stock_id = $1
      ORDER BY predict_day ASC
    `;

    const { rows } = await pool.query(query, [stockId]);

    // predict_close를 반올림한 정수로 변환
    const formattedRows = rows.map(row => ({
      predict_day: row.predict_day,
      predicted_close: Math.round(row.predicted_close)
    }));

    res.status(200).json(formattedRows);
    console.log('Stock prediction results fetched successfully:', formattedRows);
  } catch (error) {
    console.error('Error fetching stock prediction results:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
