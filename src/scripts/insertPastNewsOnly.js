// src/scripts/insertPastNewsOnly.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const pool = require("../../config/db");

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
            console.error(`❌ 삽입 실패 (${row.title}):`, err.message);
          }
        }

        console.log("✅ past_news 삽입 완료!");
        resolve();
      })
      .on("error", reject);
  });
}

(async () => {
  try {
    await insertPastNewsFromCSV();
  } catch (err) {
    console.error("❌ 실행 중 오류:", err);
  } finally {
    await pool.end();
  }
})();
