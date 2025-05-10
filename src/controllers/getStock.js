const pool = require('../../config/db'); // pg pool

exports.getStock = async (req, res) => {
    const { stockId } = req.params;
    try {
        const query = `
        SELECT
            stock_id,
            code,
            name,
            market_cap,
            open,
            high,
            low,
            close AS current_price,
            volume,
            change AS change_rate
        FROM stock_data
        WHERE stock_id=$1
        `;

        const { rows } = await pool.query(query, [stockId]);
        res.status(200).json(rows);
        console.log('Fetched stock data successfully:', rows);    
    } catch (error) {
        console.error('Error fetching stocks:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
