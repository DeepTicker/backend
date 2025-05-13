// src/utils/extractNewsTerm.js
const { spawn } = require('child_process');
const pool = require('../../config/db');

async function extractFinancialTerms(newsContent) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['ner_extractor.py']);
    let result = '';

    py.stdin.write(newsContent);
    py.stdin.end();

    py.stdout.on('data', (data) => {
      result += data.toString();
    });

    py.stderr.on('data', (err) => {
      console.error('NER stderr:', err.toString());
    });

    py.on('close', (code) => {
      if (code !== 0) return reject(new Error('NER exited with code ' + code));
      try {
        const parsed = JSON.parse(result);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function checkTermsInDatabase(terms) {
  const knownTerms = [];
  const unknownTerms = [];

  for (const term of terms) {
    const result = await pool.query('SELECT * FROM financial_terms WHERE term = $1', [term]);
    if (result.rows.length > 0) {
      knownTerms.push(result.rows[0]);
    } else {
      unknownTerms.push(term);
    }
  }

  return { knownTerms, unknownTerms };
}

module.exports = { extractFinancialTerms, checkTermsInDatabase };