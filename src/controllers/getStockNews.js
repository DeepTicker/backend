const pool = require('../../config/db'); // PostgreSQL pool 연결

exports.getStockNews = async (req, res) => {
  const { stockId } = req.params;

  try {
    const query = `
      SELECT 
        news_id,
        news_date,
        news_content,
        event_type,
        entity_recognized
      FROM stock_news
      WHERE stock_id = $1
      ORDER BY news_date DESC
    `;

    const { rows } = await pool.query(query, [stockId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching stock news:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
