// src/scripts/insertNewsStockData.js
// 뉴스에 필요한 stock 데이터 삽입

require("dotenv").config(); 

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const csv = require("csv-parser");

// PostgreSQL 연결
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// 종목코드 기준으로 theme들을 모을 Map
const results = new Map();

// CSV 경로
const csvPath = path.join(__dirname, "../../data/stock_for_news.csv");

fs.createReadStream(csvPath)
  .pipe(csv())
  .on("data", (row) => {
    const cleanRow = {};
    for (const key in row) {
      const cleanKey = key.replace(/^\uFEFF/, "").trim();  // BOM 제거
      cleanRow[cleanKey] = row[key];
    }

    const stockCode = (cleanRow["종목코드"] || "").trim();
    const stockName = (cleanRow["종목명"] || "").trim();
    const themeName = (cleanRow["테마명"] || "").trim();
    const industry = (cleanRow["업종명"] || "").trim();

    if (!stockCode) {
      console.warn("⚠️ stockCode 없음! row 스킵:", row);
      return;
    }

    if (!results.has(stockCode)) {
      results.set(stockCode, {
        stock_code: stockCode,
        stock_name: stockName,
        industry_group: industry,
        themes: new Set(),
      });
    }

    if (themeName) results.get(stockCode).themes.add(themeName);
  })
  .on("end", async () => {
    console.log("📥 news stock dataCSV 파싱 완료. DB 삽입 시작...");

    for (const [, data] of results) {
      const { stock_code, stock_name, themes, industry_group } = data;

      const insertQuery = `
        INSERT INTO tmp_stock (stock_code, stock_name, themes, industry_group)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (stock_code) DO UPDATE
        SET stock_name = EXCLUDED.stock_name,
            themes = EXCLUDED.themes,
            industry_group = EXCLUDED.industry_group
      `;

      try {
        await pool.query(insertQuery, [
          stock_code,
          stock_name,
          JSON.stringify(Array.from(themes)),
          industry_group,
        ]);
      } catch (err) {
        console.error(`❌ news stock data DB 삽입 실패 (${stock_code}):`, err.message);
      }
    }

    console.log("✅ news stock data DB 삽입 완료!");
    await pool.end();
  });
