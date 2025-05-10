// src/controllers/industryController.js
const { generateAndSaveIndustryIssues } = require('../services/generateNewsIndustryIn');
const dayjs = require('dayjs');
const pool = require('../../config/db');

// 산업군 이슈 재생성 컨트롤러
async function regenerateIndustryIssues(req, res) {
    try {
        console.log('요청 본문:', req.body); // 디버깅용 로그
        
        const { newsId, level, news_id } = req.body;
        // 실제 사용할 ID 결정 (newsId와 news_id 중 하나 선택)
        const actualNewsId = newsId || news_id;
        
        // 파라미터를 서비스 함수에 전달
        console.log('generateBackGround에서 generateAndSaveIndustryIssue를 실행시킴');
        const result = await generateAndSaveIndustryIssues(actualNewsId, level);
        
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

// 산업군 이슈 조회 컨트롤러
async function getIndustryIssues(req, res) {
    try {
        const { date } = req.query;
        const queryDate = date || dayjs().format('YYYY-MM-DD');

        const query = `
            SELECT * FROM industry_issue 
            WHERE summary_date = $1
            ORDER BY industry_name
        `;

        const result = await pool.query(query, [queryDate]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching industry issues:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// 산업군 이슈 상세 조회 컨트롤러
async function getIndustryIssueDetail(req, res) {
    try {
        const { industry, date } = req.query;
        const queryDate = date || dayjs().format('YYYY-MM-DD');

        const query = `
            SELECT * FROM industry_issue 
            WHERE industry_name = $1 
            AND summary_date = $2
        `;

        const result = await pool.query(query, [industry, queryDate]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Industry issue not found'
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching industry issue detail:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    regenerateIndustryIssues,
    getIndustryIssues,
    getIndustryIssueDetail
};