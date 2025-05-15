# src/scripts/get_stock_change.py

import pandas as pd
from datetime import timedelta
import re
import sys
import json
import psycopg2
from dotenv import load_dotenv
import os

# .env에서 DB 설정 로드
load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "dbname": os.getenv("DB_NAME"),
}

# DB 연결
conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

CSV_PATH = "data/past_news.csv"

# 입력
news_date = pd.to_datetime(sys.argv[1])
news_text = sys.argv[2]

# 1. 종목명 ↔ 종목코드 매핑 가져오기
cur.execute("SELECT stock_name, stock_code FROM tmp_stock;")
rows = cur.fetchall()
name_to_code = {name: code for name, code in rows}

# 2. 본문 내 종목명 탐색
found_stocks = []
for name, code in name_to_code.items():
    if name in news_text:
        found_stocks.append((name, code))

# 3. KOSPI / KOSDAQ 포함 여부
news_lower = news_text.lower()
if '코스피' in news_text or 'kospi' in news_lower:
    found_stocks.append(("KOSPI", "KOSPI"))
if '코스닥' in news_text or 'kosdaq' in news_lower:
    found_stocks.append(("KOSDAQ", "KOSDAQ"))

# 4. 주가 데이터 로드
price_df = pd.read_csv("data/krx_15y_data.csv", encoding="cp949", low_memory=False)
index_df = pd.read_csv("data/inv_15y_index.csv", encoding="cp949", low_memory=False)

print("✅ 컬럼명 확인:", price_df.columns.tolist())

price_df["날짜"] = pd.to_datetime(price_df["날짜"])
index_df["날짜"] = pd.to_datetime(index_df["날짜"])


# 5. 주가 구간: -3일 ~ +7일
offsets = list(range(-3, 8))

def get_price_curve(code, date, is_index=False):
    if is_index:
        df = index_df[index_df['구분'].str.upper() == code.lower()]
    else:
        df = price_df[price_df['티커'] == code]
    df = df.sort_values("날짜")
    
    curve = {}
    for offset in offsets:
        target_date = date + timedelta(days=offset)
        price_row = df[df['날짜'] == target_date]
        if not price_row.empty:
            종가 = price_row.iloc[0]['종가']
            curve[str(offset)] = 종가
        else:
            curve[str(offset)] = None
    return curve

# 6. 종목별 결과 계산
results = []
for name, code in found_stocks:
    is_index = code in ["KOSPI", "KOSDAQ"]
    curve = get_price_curve(code, news_date, is_index=is_index)

    try:
        base_price = curve["0"]
        change_plus3 = ((curve["3"] - base_price) / base_price * 100) if curve["3"] and base_price else None
        change_plus7 = ((curve["7"] - base_price) / base_price * 100) if curve["7"] and base_price else None
        change_minus3 = ((base_price - curve["-3"]) / curve["-3"] * 100) if curve["-3"] and base_price else None
    except:
        change_plus3 = change_plus7 = change_minus3 = None

    results.append({
        "종목명": name,
        "종목코드": code,
        "주가흐름": curve,
        "변화율": {
            "+3일": round(change_plus3, 2) if change_plus3 is not None else None,
            "+7일": round(change_plus7, 2) if change_plus7 is not None else None,
            "-3일대비": round(change_minus3, 2) if change_minus3 is not None else None,
        }
    })

# 7. 출력
print(json.dumps(results, ensure_ascii=False, indent=2))
