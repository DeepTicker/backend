// src/routes/newsRoute.js
const express = require("express");
const router = express.Router();
const pool = require('../../config/db');
const newsController = require('../controllers/newsController');
const industryController = require('../controllers/industryController');
const termController = require('../controllers/termController');
const backgroundController = require('../controllers/backgroundController');
const themeController = require('../controllers/themeController');
const macroController = require('../controllers/macroController');
const stockController = require('../controllers/newsStockController');
const sentimentController = require('../controllers/sentimentController');

// 메인/목록 뉴스 라우트
router.get("/main", newsController.getMainNews);
router.get("/list", newsController.getNewsList);

// 산업군 이슈 관련 라우트
router.get('/industry', industryController.getIndustryIssues);
router.get('/industry/detail', industryController.getIndustryIssueDetail);
router.post('/industry/regenerate', industryController.regenerateIndustryIssues);

// 테마 이슈 관련 라우트
router.post('/theme/regenerate', themeController.regenerateThemeIssues);

// 전반적
router.get('/macro', macroController.getMacroIssues);
router.post('/macro/regenerate', macroController.regenerateMacroIssues);

// 주식 이슈 관련 라우트
router.get('/stock/:stockCode', stockController.getStockIssues);
router.post('/stock/regenerate', stockController.regenerateStockIssues);

// 용어 관련 라우트
router.get('/term', termController.getTermNews);

// 배경지식 관련 라우트
router.post('/background', backgroundController.generateBackgroundContent);

// 감정분석 관련 라우트
router.post('/sentiment/analyze/:newsId', sentimentController.analyzeSentiment);
router.post('/sentiment/batch', sentimentController.batchAnalyzeSentiment);

router.get('/sentiment/:newsId', sentimentController.getSentimentResults);
router.get('/sentiment/stats/overview', sentimentController.getSentimentStats);

// 일반 뉴스 관련 라우트
router.get('/', newsController.getNews); // /news : 뉴스 목록 반환 (뉴스 페이지)
router.get('/:id', newsController.getNewsDetail); // /news/:id : 특정 뉴스 상세 정보 반환 (뉴스 상세 페이지)    

module.exports = router;