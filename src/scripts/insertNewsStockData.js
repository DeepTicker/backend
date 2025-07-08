// src/scripts/insertNewsStockData.js

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const pool = require("../../config/db");
const { model } = require("../../config/gemini");

// 📌 Gemini API 호출 : 429에러시 대기 후 재시도도
async function generateDescription(prompt, retries = 3) {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      // Google API가 retryDelay(대기시간)를 알려주는 경우 파싱
      let delayMs = 5000; // 기본 5초 대기
      try {
        const retryInfo = error.errorDetails?.find(detail => detail['@type']?.includes('RetryInfo'));
        if (retryInfo && retryInfo.retryDelay) {
          // retryDelay는 ISO 8601 duration (예: "49s")
          const seconds = parseInt(retryInfo.retryDelay.replace(/[^0-9]/g, ''));
          if (!isNaN(seconds)) delayMs = seconds * 1000;
        }
      } catch {
        // 무시하고 기본 delayMs 사용
      }

      console.warn(`429 Too Many Requests: ${delayMs / 1000}초 후 재시도합니다... (${retries}회 남음)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return generateDescription(prompt, retries - 1);
    }
    console.error('Gemini API 호출 오류:', error);
    throw error;
  }
}

async function generateIndustryDescription(industryName) {
  const prompt = `${industryName} 업종에 대해 중학생이 이해할 수 있는 수준으로 한 두 문장의 문어체로로 설명해주세요.`;
  return await generateDescription(prompt);
}

async function generateThemeDefinition(themeName) {
  const prompt = `${themeName} 테마에 대해 중학생이 이해할 수 있는 수준으로 한 두 문장의 문어체로 설명해주세요.`;
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

  const existingIndustries = await pool.query('SELECT industry_name FROM industry_info');
  const existingIndustryNames = new Set(existingIndustries.rows.map(row => row.industry_name));

  let processedCount = 0;
  let skippedCount = 0;

  for (const [industryName, stockCodes] of Object.entries(industryGroups)) {
    if (existingIndustryNames.has(industryName)) {
      console.log(`⏭️ 업종: ${industryName} (이미 존재, 스킵)`);
      skippedCount++;
      continue;
    }

    console.log(`→ 업종: ${industryName} (새로 생성)`);
    const description = await generateIndustryDescription(industryName);
    const topStocks = Array.from(stockCodes);

    await pool.query(
      'INSERT INTO industry_info (industry_name, description, top_stocks) VALUES ($1, $2, $3)',
      [industryName, description, topStocks]
    );
    processedCount++;
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

  const existingThemes = await pool.query('SELECT theme_name FROM theme_info');
  const existingThemeNames = new Set(existingThemes.rows.map(row => row.theme_name));

  let processedCount = 0;
  let skippedCount = 0;

  for (const [themeName, stockCodes] of Object.entries(themeGroups)) {
    if (existingThemeNames.has(themeName)) {
      console.log(`⏭️ 테마: ${themeName} (이미 존재, 스킵)`);
      skippedCount++;
      continue;
    }

    console.log(`→ 테마: ${themeName} (새로 생성)`);
    const definition = await generateThemeDefinition(themeName);
    const beneficiaries = Array.from(stockCodes);

    await pool.query(
      'INSERT INTO theme_info (theme_name, definition, beneficiaries) VALUES ($1, $2, $3)',
      [themeName, definition, beneficiaries]
    );
    processedCount++;
  }

  console.log("✅ 테마 정보 삽입 완료!");
}

// 📌 과거 뉴스 삽입
async function insertPastNewsFromCSV() {
  return new Promise((resolve, reject) => {
    const csvPath = path.join(__dirname, "../../data/past_news.csv");
    const results = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        const cleanRow = {};
        for (const key in row) {
          const cleanKey = key.replace(/^\uFEFF/, "").trim(); // BOM 제거
          cleanRow[cleanKey] = row[key];
        }

        results.push({
          title: cleanRow["제목"]?.trim(),
          url: cleanRow["링크"]?.trim(),
          press: cleanRow["언론사"]?.trim(),
          published_at: cleanRow["날짜"]?.trim(),
          reporter: cleanRow["기자"]?.trim(),
          content: cleanRow["본문정리"]?.trim(),
        });
      })
      .on("end", async () => {
        console.log(`📥 past_news CSV 로딩 완료 (${results.length}건)`);

        for (const row of results) {
          if (!row.title || !row.published_at || !row.content) continue;

          try {
            await pool.query(`
              INSERT INTO past_news (title, url, press, published_at, reporter, content)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (title) DO NOTHING
            `, [
              row.title,
              row.url,
              row.press,
              row.published_at,
              row.reporter,
              row.content,
            ]);
          } catch (err) {
            console.error(`❌ past_news 삽입 실패 (${row.title}):`, err.message);
          }
        }

        console.log("✅ past_news 삽입 완료!");
        resolve();
      })
      .on("error", reject);
  });
}

// 📌 전체 실행
(async () => {
  try {
    console.log("insertNewsStockData 시작");

    //await insertTmpStockFromCSV();
    await initializeIndustryInfo();
    await initializeThemeInfo();
    //await insertPastNewsFromCSV(); //과거뉴스 삽입은 아직
    
    console.log("insertNewsStockData 완료!");
  } catch (err) {
    console.error("❌ insertNewsStockData 중 오류:", err);
  } finally {
    await pool.end();
  }
})();
