// src/scripts/processNewsTerms.js

const { processAllNewsFromRawTable } = require('../services/generateNewsTerm');

(async () => {
  await processAllNewsFromRawTable();
})();