const express = require('express');
const router = express.Router();
const getStockFactor = require('../controllers/getStockFactors');
const getStockList = require('../controllers/getStockList');
const getStockNews = require('../controllers/getStockNews')
const getStockPrediction = require('../controllers/getStockPrediction');
const getStockRecom = require('../controllers/getStockRecoms');;
const getStock = require('../controllers/getStock');

// router.get('/stocks/:stockId/factors', getStockFactor.getStockFactors);
router.get('/stocks', getStockList.getStockList); 
// router.get('/stocks/:stockId/news', getStockNews.getStockNews);
router.get('/stocks/:stockId/recommendations', getStockRecom.getStockRecoms);
router.get('/stocks/:stockId/predictions', getStockPrediction.getStockPrediction);
router.get('/stocks/:stockId/data', getStock.getStock);


// router.get('/stocks', (req, res) => {
//     console.log("✅ stocks route hit!");
//     res.send("Hello from stocks!");
// }); 

module.exports = router;


