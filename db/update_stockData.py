import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
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

def connect_db():
    return psycopg2.connect(**DB_CONFIG)

def upload_excel_to_db(excel_path):
    df = pd.read_excel(excel_path)

    # 컬럼명 확인
    expected_columns = [
        "Date", "Code", "Name", "MarCap", "Open", "High", "Low", "Close", "Volume", "Change"
    ]
    if not all(col in df.columns for col in expected_columns):
        raise ValueError(f"Excel 파일에 다음 컬럼이 있어야 합니다: {expected_columns}")

    # NaN → None
    df = df.where(pd.notnull(df), None)

    # 날짜 포맷 맞추기
    df['date'] = pd.to_datetime(df['Date']).dt.date

    records = df[expected_columns].values.tolist()

    insert_sql = """
        INSERT INTO stock_data (date, code, name, market_cap, open, high, low, close, volume, change)
        VALUES %s
    """

    conn = connect_db()
    with conn:
        with conn.cursor() as cur:
            execute_values(cur, insert_sql, records)
            print(f"{len(records)}개 레코드를 삽입했습니다.")

if __name__ == "__main__":
    excel_path = "../data/krx_stockdata.xlsx"  # 엑셀 파일 경로 수정
    upload_excel_to_db(excel_path)
