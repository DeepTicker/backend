const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pool = require('../../config/db');

const filePath = path.join(__dirname, '../../data/merged_15y_data.csv');

// 숫자 변환 유틸
const toInt = (val) => {
  const n = parseInt(val);
  return Number.isNaN(n) ? null : n;
};

const toFloat = (val) => {
  const n = parseFloat(val);
  return Number.isNaN(n) ? null : n;
};

// 행 삽입 함수
async function insertRow(row) {
  const query = `
    INSERT INTO krx_inv_15y_data (
      date, market, ticker, open, high, low, close, volume, trade_value, change_rate
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    )
    ON CONFLICT (date, ticker) DO NOTHING;
  `;

  const values = [
    row['날짜'],
    row['시장']?.trim() || null,
    row['티커'],
    toInt(row['시가']),
    toInt(row['고가']),
    toInt(row['저가']),
    toInt(row['종가']),
    toInt(row['거래량']),
    toInt(row['거래대금']),
    toFloat(row['등락률']),
  ];

  await pool.query(query, values);
}

// 메인 실행 함수
async function run() {
  // 🔁 동적 import: p-limit 모듈 가져오기 (ESM 모듈이기 때문에)
  const pLimit = await import('p-limit').then(mod => mod.default);

  const rows = [];

  // CSV 파싱
  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => rows.push(row))
    .on('end', async () => {
      console.log(`📥 총 ${rows.length}개 행 삽입 시작`);

      const limit = pLimit(20); // 동시에 20개씩 실행
      let count = 0;

      // 병렬 삽입 작업 구성
      const tasks = rows.map((row, idx) =>
        limit(async () => {
          try {
            await insertRow(row);
            count++;
            if (count % 10000 === 0) {
              console.log(`🚀 ${count}건 삽입 완료`);
            }
          } catch (err) {
            console.error('❌ 삽입 오류:', {
              message: err.message,
              row,
              stack: err.stack,
            });
          }
        })
      );

      // 병렬로 수행하고 완료될 때까지 대기
      await Promise.allSettled(tasks);

      // DB 커넥션 정리
      await pool.end();

      console.log(`✅ 삽입 완료: 총 ${count}건`);
    });
}

run();
