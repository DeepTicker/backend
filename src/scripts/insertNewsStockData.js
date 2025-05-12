// src/scripts/insertNewsStockData.js

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const pool = require("../../config/db");
const { model } = require("../../config/gemini");

// 📌 Gemini API 호출
async function generateDescription(prompt) {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API 호출 오류:', error);
    throw error;
  }
}

async function generateIndustryDescription(industryName) {
  const prompt = `${industryName} 업종에 대해 중학생이 이해할 수 있는 수준으로 한 두 문장으로 설명해주세요.`;
  return await generateDescription(prompt);
}

async function generateThemeDefinition(themeName) {
  const prompt = `${themeName} 테마에 대해 중학생이 이해할 수 있는 수준으로 한 두 문장으로 설명해주세요.`;
  return await generateDescription(prompt);
}

// 📌 CSV 읽기 및 tmp_stock 채우기
async function insertTmpStockFromCSV() {
  return new Promise((resolve, reject) => {
    const results = new Map();
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

        if (!stockCode) return;

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
        console.log("📥 CSV 파싱 완료. tmp_stock에 삽입 시작...");

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
            console.error(`❌ tmp_stock 삽입 실패 (${stock_code}):`, err.message);
          }
        }

        console.log("✅ tmp_stock 삽입 완료!");
        resolve();
      })
      .on("error", reject);
  });
}

// 📌 업종 정보 초기화
async function initializeIndustryInfo() {
  const { rows } = await pool.query("SELECT stock_code, industry_group FROM tmp_stock");

  const industryGroups = {};
  rows.forEach(row => {
    const industry = row.industry_group;
    if (!industry) return;
    if (!industryGroups[industry]) industryGroups[industry] = new Set();
    industryGroups[industry].add(row.stock_code);
  });

  for (const [industryName, stockCodes] of Object.entries(industryGroups)) {
    console.log(`→ 업종: ${industryName}`);
    const description = await generateIndustryDescription(industryName);
    const topStocks = Array.from(stockCodes);

    await pool.query(
      'INSERT INTO industry_info (industry_name, description, top_stocks) VALUES ($1, $2, $3)',
      [industryName, description, topStocks]
    );
  }

  console.log("✅ 업종 정보 삽입 완료!");
}

// 📌 테마 정보 초기화
async function initializeThemeInfo() {
  const { rows } = await pool.query("SELECT stock_code, themes FROM tmp_stock");

  const themeGroups = {};
  rows.forEach(row => {
    const stockCode = row.stock_code;
    const themes = row.themes || [];
    themes.forEach(theme => {
      if (!themeGroups[theme]) themeGroups[theme] = new Set();
      themeGroups[theme].add(stockCode);
    });
  });

  for (const [themeName, stockCodes] of Object.entries(themeGroups)) {
    console.log(`→ 테마: ${themeName}`);
    const definition = await generateThemeDefinition(themeName);
    const beneficiaries = Array.from(stockCodes);

    await pool.query(
      'INSERT INTO theme_info (theme_name, definition, beneficiaries) VALUES ($1, $2, $3)',
      [themeName, definition, beneficiaries]
    );
  }

  console.log("✅ 테마 정보 삽입 완료!");
}

// 📌 전체 실행
(async () => {
  try {
    console.log("insertNewsStockData 시작");

    await insertTmpStockFromCSV();
    await initializeIndustryInfo();
    await initializeThemeInfo();

    console.log("insertNewsStockData 완료!");
  } catch (err) {
    console.error("❌ insertNewsStockData 중 오류:", err);
  } finally {
    await pool.end();
  }
})();
