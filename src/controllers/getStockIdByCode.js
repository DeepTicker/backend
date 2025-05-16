const pool = require('../../config/db'); // pg pool 

exports.getStockIdByCode = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ message: 'Stock code is required' });
    }

    const query = `
      SELECT stock_id 
      FROM stock_data 
      WHERE code = $1
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [code]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Stock code not found' });
    }

    res.status(200).json({ stock_id: rows[0].stock_id });
    console.log(`Fetched stock_id for code ${code}:`, rows[0].stock_id);

  } catch (error) {
    console.error('Error fetching stock_id:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
