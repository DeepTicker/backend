// src/controllers/stockController.js
const { generateAndSaveStockIssues } = require('../services/generateNewsStockIn');
const { getNewsStockIssue } = require('../services/getNewsStockIssue');
const pool = require('../../config/db');

// 주식 이슈 재생성
async function regenerateStockIssues(req, res) {
    try {
        const { stockCode } = req.body;
        
        if (!stockCode) {
            return res.status(400).json({
                success: false,
                error: '주식 코드가 필요합니다.'
            });
        }
        
        const result = await generateAndSaveStockIssues(stockCode);
        
        res.json({
            success: true,
            stockCode,
            ...result
        });
    } catch (error) {
        console.error('Error in regenerateStockIssues:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// 주식 이슈 조회
async function getStockIssues(req, res) {
    try {
        const { stockCode } = req.params;
        
        if (!stockCode) {
            return res.status(400).json({
                success: false,
                error: '주식 코드가 필요합니다.'
            });
        }
        
        const query = `
            SELECT *
            FROM stock_issue
            WHERE stock_code = $1
            ORDER BY summary_date DESC
            LIMIT 1
        `;
        
        const result = await pool.query(query, [stockCode]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '주식 이슈를 찾을 수 없습니다.'
            });
        }
        
        res.json({
            success: true,
            stockIssue: result.rows[0]
        });
    } catch (error) {
        console.error('Error in getStockIssues:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    regenerateStockIssues,
    getStockIssues
};