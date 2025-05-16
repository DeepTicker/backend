const { Client } = require('pg');
const { addDays, format } = require('date-fns');
const dayjs = require('dayjs');
const dotenv = require('dotenv');
dotenv.config();

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

// 주가 변화 데이터 조회 함수
async function getStockChanges(date, stockCodes) {
  const client = new Client(DB_CONFIG);
  await client.connect();

  try {
    const results = [];

    for (const stockCode of stockCodes) {
      const stockQuery = `
        SELECT stock_code, stock_name
        FROM tmp_stock
        WHERE stock_code = $1
        LIMIT 1
      `;
      const stockResult = await client.query(stockQuery, [stockCode]);

      if (stockResult.rows.length === 0) {
        console.log(`❗️ 주식 정보를 찾을 수 없음: ${stockCode}`);
        continue;
      }

      const stock = stockResult.rows[0];

      const priceQuery = `
        WITH date_range AS (
          SELECT generate_series(
            $1::date - interval '3 days',
            $1::date + interval '7 days',
            '1 day'
          )::date AS date
        )
        SELECT 
          d.date,
          k.close,
          k.volume,
          k.change_rate
        FROM date_range d
        LEFT JOIN krx_inv_15y_data k ON k.date = d.date AND k.ticker = $2
        ORDER BY d.date
      `;
      const priceResult = await client.query(priceQuery, [date, stockCode]);

      const baseDate = dayjs(date);
      const baseRow = priceResult.rows.find(r => 
        dayjs(r.date).format('YYYY-MM-DD') === baseDate.format('YYYY-MM-DD')
      );

      if (!baseRow) {
        console.log(`❗️ 기준일 주가 데이터가 없습니다: ${stockCode}`);
        continue;
      }

      const priceChanges = {};
      for (const row of priceResult.rows) {
        const diff = dayjs(row.date).diff(baseDate, 'day');
        priceChanges[diff] = {
          date: row.date,
          price: row.close,
          volume: row.volume,
          change: row.change_rate
        };
      }

      results.push({
        stockCode: stock.stock_code,
        stockName: stock.stock_name,
        date: baseDate.format('YYYY-MM-DD'),
        priceChange: baseRow.change_rate,
        volume: baseRow.volume,
        marketCap: null,
        priceChanges
      });
    }

    return results;
  } catch (error) {
    console.error('주가 변화 데이터 조회 실패:', error);
    return null;
  } finally {
    await client.end();
  }
}

module.exports = { getStockChanges };
