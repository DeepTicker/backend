import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from sklearn.preprocessing import MinMaxScaler
from dotenv import load_dotenv
import os

# .env 로드
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

def upload_close_row(excel_path):
    df = pd.read_excel(excel_path)
    close_cols = [f"close_{i+1}" for i in range(30)]
    close_sid_cols = close_cols + ["종목코드"]

    close_df = df[close_sid_cols].copy()
    clean_df = close_df.dropna()

    conn = connect_db()
    cur = conn.cursor()

    # 기존 테이블 초기화
    cur.execute("TRUNCATE TABLE stock_close_sequence_scaled;")
    cur.execute("TRUNCATE TABLE stock_scaler_info;")
    print("⚠️ stock_close_sequence_scaled, stock_scaler_info 테이블의 기존 데이터가 비워졌습니다.")

    def get_stock_id_by_code(code):
        if pd.isna(code):
            return None
        cur.execute("SELECT stock_id FROM stock_data WHERE code = %s", (code,))
        result = cur.fetchone()
        return result[0] if result else None

    inserted_scaled = 0
    inserted_minmax = 0

    for _, row in clean_df.iterrows():
        code = row["종목코드"]
        stock_id = get_stock_id_by_code(code)
        if not stock_id:
            print(f"❌ stock_id 없음: 종목코드 {code}")
            continue

        close_values = [row[col] for col in close_cols]
        close_min = float(min(close_values))
        close_max = float(max(close_values))

        # MinMaxScaler 적용
        scaled_values = MinMaxScaler().fit_transform([[v] for v in close_values])
        scaled_flat = [float(v[0]) for v in scaled_values]  


        # scaled row 저장
        try:
            cur.execute(f"""
                INSERT INTO stock_close_sequence_scaled (
                    stock_id, {', '.join(close_cols)}
                ) VALUES (
                    %s, {', '.join(['%s'] * 30)}
                )
            """, [stock_id] + scaled_flat)
            inserted_scaled += 1
        except Exception as e:
            print(f"❗ Scaled INSERT 실패 (code={code}): {e}")

        # Min/Max 저장
        try:
            cur.execute("""
                INSERT INTO stock_scaler_info (stock_id, close_min, close_max)
                VALUES (%s, %s, %s)
                ON CONFLICT (stock_id) DO UPDATE
                SET close_min = EXCLUDED.close_min,
                    close_max = EXCLUDED.close_max;
            """, (stock_id, close_min, close_max))
            inserted_minmax += 1
        except Exception as e:
            print(f"❗ MinMax INSERT 실패 (code={code}): {e}")

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ 정규화된 {inserted_scaled}개 종목 저장 완료.")
    print(f"✅ MinMax 저장 완료된 종목 수: {inserted_minmax}")

if __name__ == "__main__":
    upload_close_row("data/krx_stockseq.xlsx")
