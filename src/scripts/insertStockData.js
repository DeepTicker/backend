//주식 중 뉴스에서 필요한 것 (임시)
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

const results = new Map(); // 종목코드 기준으로 theme 모으기

const csvPath = "C:/Users/shlee/TMPBACKEND/data/final_stock_theme.csv";

fs.createReadStream(csvPath)
  .pipe(csv())
  //csv로 인코딩할 때 열 이름에 BOM이 숨어들어가 인식하지 못했음 -> 해결!
  .on("data", (row) => {
    const cleanRow = {};
    for (const key in row) {
      const cleanKey = key.replace(/^\uFEFF/, "").trim();  // ← BOM 제거 + trim
      cleanRow[cleanKey] = row[key];
    }

    // 키 이름 정제
    const stockCode = (cleanRow["종목코드"] || "").trim();
    const stockName = (cleanRow["종목명"] || "").trim();
    const themeName = (cleanRow["테마명"] || "").trim();
    const industry = (cleanRow["산업군"] || "").trim();
    const marketType = (cleanRow["시장구분"] || "").trim();
        
    if (!stockCode) {
      console.warn("⚠️ stockCode 없음! row 스킵:", row);
      return;
    }

    if (!["KOSPI", "KOSDAQ"].includes(marketType)) return;

    if (!results.has(stockCode)) {
      results.set(stockCode, {
        stock_code: stockCode,
        stock_name: stockName,
        industry_group: industry,
        market_type: marketType,
        themes: new Set(),
      });
    }

    if (themeName) results.get(stockCode).themes.add(themeName);
  })
  .on("end", async () => {
    console.log("CSV 파싱 완료. DB에 삽입 시작...");

    for (const [, data] of results) {
      const { stock_code, stock_name, themes, industry_group, market_type } = data;

      const insertQuery = `
        INSERT INTO tmp_stock (stock_code, stock_name, themes, industry_group, market_type)
        VALUES ($1, $2, $3::jsonb, $4, $5)
        ON CONFLICT (stock_code) DO UPDATE
        SET stock_name = EXCLUDED.stock_name,
            themes = EXCLUDED.themes,
            industry_group = EXCLUDED.industry_group,
            market_type = EXCLUDED.market_type
      `;

      try {
        await pool.query(insertQuery, [
          stock_code,
          stock_name,
          JSON.stringify(Array.from(themes)),
          industry_group,
          market_type,
        ]);
      } catch (err) {
        console.error(`❌ DB 삽입 실패 (${stock_code}):`, err.message);
      }
    }

    console.log("✅ DB 삽입 완료!");
    await pool.end();
  });