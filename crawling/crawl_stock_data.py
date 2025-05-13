import os
import FinanceDataReader as fdr
from datetime import datetime, timedelta
import holidays
import sys

# 한국 공휴일 정의
kr_holidays = holidays.KR()

# 오늘 날짜
today = datetime.today()
weekday = today.weekday()  # 월:0, ..., 토:5, 일:6

# 주말 또는 공휴일이면 종료
if weekday >= 5 or today in kr_holidays:
    print(f"❌ 오늘은 주말 혹은 공휴일({today.date()})입니다. 크롤링 중단.")
    sys.exit()

# 날짜 구간 설정 (예: 최근 45일)
start_date = (today - timedelta(days=45)).strftime('%Y-%m-%d')
end_date = today.strftime('%Y-%m-%d')
date_ranges = [(start_date, end_date)]

krx = fdr.StockListing('KRX')
top_marcap_500 = krx.sort_values(by='Marcap',  =False).head(500)
bottom_marcap_500 = krx.sort_values(by='Marcap', ascending=True).head(500)
combined_krx_1000 = pd.concat([top_marcap_500, bottom_marcap_500])
print(combined_krx_1000)

def get_stock_price_on_date(code, name, market_cap, date):
    try:
        df = fdr.DataReader(code, date, date)
        if not df.empty:
            row = df.iloc[0]
            return {
                'Code': code,
                'Name': name,
                'Date': date,
                'MarCap': market_cap,
                'Open': row['Open'],
                'High': row['High'],
                'Low': row['Low'],
                'Close': row['Close'],
                'Volume': row['Volume'],
                'Change': row['Change']
            }
    except:
        return None

for start_date, end_date in date_ranges:
    print(f"📅 기간 처리 중: {start_date} ~ {end_date}")
    results = []

    for idx, row in combined_krx_1000.iterrows():
        result = build_single_row(row['Code'], row['Name'], start_date, end_date)
        if result:
            results.append(result)
            print(f"✅ {idx}번째: {row['Name']} 추가됨")

    output_path = f'../data/krx_stockdata.xlsx'
    initialize_excel(output_path, columns)
    print("="*10)
    print("파일생성 여부:")
    print(os.path.exists(output_path))

    save_all_to_excel(output_path, results)
    print("="*10)
    print("파일저장 여부:")
    print(os.path.exists(output_path))

# ✅ 크롤링이 성공적으로 끝났으니 update_stockdata.py 실행
print("🚀 DB 업데이트 실행 중...")
subprocess.run(["python", "../db/update_stockdata.py"])