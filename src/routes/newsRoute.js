// src/routes/newsRoutes.js
const express = require("express");
const router = express.Router();
const { getMainNews, getNewsList } = require("../controllers/newsController");

router.get("/main", getMainNews);
router.get("/list", getNewsList);

module.exports = router;