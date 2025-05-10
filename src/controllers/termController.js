// src/controllers/termController.js
const { Pool } = require('pg');
const dayjs = require('dayjs');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// 용어 관련 뉴스 조회 컨트롤러
async function getTermNews(req, res) {
    try {
        const { term, date } = req.query;
        const queryDate = date || dayjs().format('YYYY-MM-DD');

        const query = `
            SELECT * FROM news_term 
            WHERE term = $1 
            AND summary_date = $2
        `;

        const result = await pool.query(query, [term, queryDate]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Term news not found'
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching term news:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    getTermNews
};