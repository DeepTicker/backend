// src/controllers/macroController.js
const { generateAndSaveMacroIssues } = require('../services/generateNewsMacroIn');
const pool = require('../../config/db');

// 매크로 이슈 재생성
async function regenerateMacroIssues(req, res) {
    try {
        const { level } = req.body;
        const result = await generateAndSaveMacroIssues(level);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error in regeneration:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// 매크로 이슈 조회
async function getMacroIssues(req, res) {
    try {
        const query = `
            SELECT summary_date, summary_title, summary_detail, related_indicators, market_impact
            FROM macro_issue
            ORDER BY summary_date DESC
            LIMIT 1
        `;
        
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No macro issues found'
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching macro issues:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    regenerateMacroIssues,
    getMacroIssues
};