import sys
import json
import psycopg2
import pandas as pd
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
import io

# UTF-8 출력 보장
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 환경변수 로드
load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "dbname": os.getenv("DB_NAME"),
}

def connect_db():
    return psycopg2.connect(**DB_CONFIG)

def get_stock_changes(base_date, stock_codes):
    """주식 코드들에 대한 주가 변화율 계산"""
    conn = connect_db()
    cur = conn.cursor()
    
    results = []
    base_date_obj = datetime.strptime(base_date, '%Y-%m-%d').date()
    
    for stock_code in stock_codes:
        try:
            if stock_code.upper() in ['KOSPI', 'KOSDAQ']:
                # 지수인 경우 -> todo
                stock_name = stock_code
                ticker = stock_code.lower()  # kospi, kosdaq로 변환
            else:
                cur.execute("SELECT stock_name FROM tmp_stock WHERE stock_code = %s", (stock_code,))
                result = cur.fetchone()
                if not result:
                    print(f"Stock not found: {stock_code}", file=sys.stderr)
                    continue
                stock_name = result[0]
                ticker = stock_code
            
            start_date = base_date_obj - timedelta(days=10)
            end_date = base_date_obj + timedelta(days=10)
            
            cur.execute("""
                SELECT date, close, volume, change_rate
                FROM krx_inv_15y_data 
                WHERE ticker = %s 
                AND date BETWEEN %s AND %s
                ORDER BY date
            """, (ticker, start_date, end_date))
            
            price_data = cur.fetchall()
            if not price_data:
                print(f"No price data found for {stock_code}", file=sys.stderr)
                continue
                
            df = pd.DataFrame(price_data, columns=['date', 'close', 'volume', 'change_rate'])
            df['date'] = pd.to_datetime(df['date'])
            base_date_pd = pd.to_datetime(base_date)
            
            base_row = df[df['date'] == base_date_pd]
            if base_row.empty:
                before_dates = df[df['date'] < base_date_pd]
                if before_dates.empty:
                    print(f"No base date data for {stock_code}", file=sys.stderr)
                    continue
                base_row = before_dates.iloc[-1:] 
                
            base_price = float(base_row.iloc[0]['close'])
            base_volume = int(base_row.iloc[0]['volume']) if base_row.iloc[0]['volume'] else 0
            
            changes = {}
            
            # -3
            minus_3_date = base_date_pd - timedelta(days=3)
            minus_3_data = df[df['date'] <= minus_3_date]
            if not minus_3_data.empty:
                minus_3_price = float(minus_3_data.iloc[-1]['close'])
                changes['-3일대비'] = round(((base_price - minus_3_price) / minus_3_price) * 100, 2)
            else:
                changes['-3일대비'] = 0.0
                
            # +3
            plus_3_date = base_date_pd + timedelta(days=3)
            plus_3_data = df[df['date'] >= plus_3_date]
            if not plus_3_data.empty:
                plus_3_price = float(plus_3_data.iloc[0]['close'])
                changes['+3일'] = round(((plus_3_price - base_price) / base_price) * 100, 2)
            else:
                changes['+3일'] = 0.0
                
            # +7
            plus_7_date = base_date_pd + timedelta(days=7)
            plus_7_data = df[df['date'] >= plus_7_date]
            if not plus_7_data.empty:
                plus_7_price = float(plus_7_data.iloc[0]['close'])
                changes['+7일'] = round(((plus_7_price - base_price) / base_price) * 100, 2)
            else:
                changes['+7일'] = 0.0
            
            results.append({
                "종목코드": stock_code,
                "종목명": stock_name,
                "기준일가격": base_price,
                "거래량": base_volume,
                "변화율": changes
            })
            
        except Exception as e:
            print(f"Error processing {stock_code}: {e}", file=sys.stderr)
            continue
    
    conn.close()
    return results

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python get_stock_change.py <date> <stock_codes_json>"}, ensure_ascii=False))
        return
    
    base_date = sys.argv[1]
    stock_codes_json = sys.argv[2]
    
    try:
        stock_codes = json.loads(stock_codes_json)
        if not isinstance(stock_codes, list):
            raise ValueError("stock_codes must be a list")
            
        results = get_stock_changes(base_date, stock_codes)
        print(json.dumps(results, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)

if __name__ == "__main__":
    main() 