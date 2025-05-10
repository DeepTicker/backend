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

// 일반 뉴스 관련 라우트
router.get('/', newsController.getNews);
router.get('/:id', newsController.getNewsDetail);

module.exports = router;