const pool = require('../../config/db'); // pg pool

exports.getStockList = async (req, res) => {
  try {
    const query = `
      SELECT
        stock_id,
        name,
        close AS current_price,
        change_rate,
        market_cap,
        volume
      FROM stock_data
      WHERE date = CURRENT_DATE
      ORDER BY volume DESC
    `;

    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
