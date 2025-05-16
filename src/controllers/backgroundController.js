// src/controllers/backgroundController.js
const { generateBackground } = require('../services/generateBackground');

async function generateBackgroundContent(req, res) {
    try {
        const { category, level, content, representative, newsDate } = req.body;
        
        console.log('배경지식 생성 요청:', { category, level, representative, newsDate });
        
        const { background, message, advancedData } = await generateBackground(
            category,
            level,
            content,
            representative,
            newsDate
        );

        res.json({ 
            background, 
            message,
            advancedData: advancedData || null
        });
    } catch (error) {
        console.error('Error generating background:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    generateBackgroundContent
};