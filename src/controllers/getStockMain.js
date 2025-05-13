const pool = require('../../config/db');

exports.getStockMain = async (req, res) => {
  try {
    // 1. 거래량 상위 5개 stock_id 가져오기
    const topStocksResult = await pool.query(`
      SELECT stock_id, name, volume
      FROM stock_data
      ORDER BY volume DESC
      LIMIT 5
    `);

    const predictionData = {};

    for (const row of topStocksResult.rows) {
      const { stock_id, name, volume } = row;

      const predictionResult = await pool.query(
        `
        SELECT predict_day, predicted_close
        FROM stock_prediction_result
        WHERE stock_id = $1
        ORDER BY predict_day ASC
        `,
        [stock_id]
      );

      predictionData[stock_id] = {
        name,
        volume,
        predictions: predictionResult.rows
      };
    }

    res.status(200).json(predictionData);
    console.log(`Top 5 stocks with highest volume:`, Object.keys(predictionData));
    console.log(`Prediction data: ${JSON.stringify(predictionData)}`);
  } catch (error) {
    console.error('Error in getStockPredictions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
