// src/controllers/themeController.js
const { generateAndSaveThemeIssues } = require('../services/generateNewsThemeIn');

async function regenerateThemeIssues(req, res) {
    try {
      const { news_id } = req.body; // ✅ snake_case로 받아야 프론트와 일치
      if (!news_id) throw new Error('news_id가 제공되지 않았습니다');
  
      await generateAndSaveThemeIssues(news_id);
      res.json({ success: true });
    } catch (err) {
      console.error('Error in regeneration:', err);
      res.status(500).json({ error: err.message });
    }
  }

module.exports = {
    regenerateThemeIssues
};