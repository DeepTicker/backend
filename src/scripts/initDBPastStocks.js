const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pool = require('../../config/db');

const filePath = path.join(__dirname, '../../data/merged_15y_data_new.csv');

const BATCH_SIZE = 1000;

const toInt = (val) => {
  const n = parseInt(val);
  return Number.isNaN(n) ? null : n;
};

const toFloat = (val) => {
  const n = parseFloat(val);
  return Number.isNaN(n) ? null : n;
};

// insert 함수 (배치로 처리)
async function insertBatch(batch) {
  const query = `
    INSERT INTO krx_inv_15y_data (
      date, market, ticker, open, high, low, close, volume, trade_value, change_rate
    ) VALUES ${batch.map((_, i) => `(
      $${i*10+1}, $${i*10+2}, $${i*10+3}, $${i*10+4}, $${i*10+5},
      $${i*10+6}, $${i*10+7}, $${i*10+8}, $${i*10+9}, $${i*10+10}
    )`).join(',')}
    ON CONFLICT (date, ticker) DO NOTHING;
  `;

  const values = batch.flatMap(row => [
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
  ]);

  await pool.query(query, values);
}

// 메인 함수
async function run() {
  let buffer = [];
  let count = 0;

  const stream = fs.createReadStream(filePath).pipe(csv());

  for await (const row of stream) {
    buffer.push(row);

    if (buffer.length >= BATCH_SIZE) {
      await insertBatch(buffer);
      count += buffer.length;
      console.log(`✅ ${count}건 삽입 완료`);
      buffer = [];
    }
  }

  // 남은 데이터 삽입
  if (buffer.length > 0) {
    await insertBatch(buffer);
    count += buffer.length;
    console.log(`✅ 최종 ${count}건 삽입 완료`);
  }

  await pool.end();
  console.log('🎉 DB 커넥션 종료');
}

run().catch((err) => {
  console.error('❌ 실행 중 오류 발생:', err);
  process.exit(1);
});
