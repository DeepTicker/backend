import pandas as pd
from tqdm import tqdm
import FinanceDataReader as fdr
import subprocess  # 외부 파일 실행용
import datetime
import holidays

# 오늘 날짜
today = datetime.date.today()
kr_holidays = holidays.KR(years=today.year)

# 주말 또는 공휴일 체크
if today.weekday() >= 5 or today in kr_holidays:
    print("주말 또는 공휴일이라서 실행하지 않습니다.")
    exit()

data = []
target_date = today.strftime('%Y-%m-%d')
print(target_date)  # 오늘 날짜를 "YYYY-MM-DD" 문자열로 변환

krx = fdr.StockListing('KRX')
top_marcap_500 = krx.sort_values(by='Marcap', ascending=False).head(500)
bottom_marcap_500 = krx.sort_values(by='Marcap', ascending=True).head(500)
df = pd.concat([top_marcap_500, bottom_marcap_500])

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


for _, row in tqdm(df.iterrows(), total=len(df)):
    result = get_stock_price_on_date(row['Code'], row['Name'], row['Marcap'], target_date)
    if result:
        data.append(result)

df_all = pd.DataFrame(data)

# 크롤링 결과 저장(필요시)
df_all.to_excel('../data/krx_stockdata.xlsx', index=False)


# 크롤링 끝나면 DB 바꾸는 스크립트 실행 (예: update_db.py)
subprocess.run(['python', '../db/update_stockData.py'], check=True)
