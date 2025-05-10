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
    close_sid_cols = [f"close_{i+1}" for i in range(30)]+["종목코드"]

    # 정규화할 데이터만 복사
    close_df = df[close_sid_cols].copy()

    # NaN 있는 행은 제거 (스케일링 전에 필요)
    clean_df = close_df.dropna()
    clean_df_scaled = close_df.drop(columns=["종목코드"])

    # MinMax 스케일링
    scaler = MinMaxScaler()
    scaled_values = scaler.fit_transform(clean_df_scaled)
    scaled_df = pd.DataFrame(scaled_values, columns=close_cols)

    # MinMax 값 저장 (전체 데이터의 최소값과 최대값)
    close_min = float(clean_df_scaled.min().min())  # 전체 데이터의 최소값을 float로 변환
    close_max = float(clean_df_scaled.max().max())  # 전체 데이터의 최대값을 float로 변환

    # DB에 MinMax 값 저장
    conn = connect_db()
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE stock_scaler_info;")
    print("⚠️ stock_scaler_info 테이블의 기존 데이터가 비워졌습니다.")

    # stock_scaler_info 테이블에 MinMax 값 저장
    try:
        cur.execute("""
            INSERT INTO stock_scaler_info (close_min, close_max)
            VALUES (%s, %s)
        """, (close_min, close_max)) 
        print("✅ MinMax 값이 stock_scaler_info에 저장되었습니다.")
    except Exception as e:
        print(f"❗ MinMax 저장 실패: {e}")
    
    # 인덱스 맞추기 (stock_id 연결을 위해)
    scaled_df["종목코드"] = df.loc[clean_df.index, "종목코드"]

    cur.execute("TRUNCATE TABLE stock_close_sequence_scaled;")
    print("⚠️ stock_closed_sequence_scaled 테이블의 기존 데이터가 비워졌습니다.")

    def get_stock_id_by_code(code):
        if pd.isna(code):
            return None
        cur.execute("SELECT stock_id FROM stock_data WHERE code = %s", (code,))
        result = cur.fetchone()
        return result[0] if result else None

    inserted = 0
    for _, row in scaled_df.iterrows():
        code = row["종목코드"]
        stock_id = get_stock_id_by_code(code)
        if not stock_id:
            print(f"❌ stock_id 없음: 종목코드 {code}")
            continue

        values = [stock_id] + [row[col] for col in close_cols]
        insert_sql = f"""
            INSERT INTO stock_close_sequence_scaled (
                stock_id, {', '.join(close_cols)}
            ) VALUES (
                %s, {', '.join(['%s'] * 30)}
            )
        """
        try:
            cur.execute(insert_sql, values)
            inserted += 1
        except Exception as e:
            print(f"❗ INSERT 실패 (code={code}): {e}")

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ 정규화된 {inserted}개 종목 데이터 저장 완료.")

if __name__ == "__main__":
    upload_close_row("../data/krx_stockseq.xlsx")
