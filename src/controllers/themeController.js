// src/controllers/themeController.js
const { generateAndSaveThemeIssues } = require('../services/generateNewsThemeIn');

async function regenerateThemeIssues(req, res) {
    try {
        const { newsId, level } = req.body;
        const result = await generateAndSaveThemeIssues(newsId, level);
        
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

module.exports = {
    regenerateThemeIssues
};