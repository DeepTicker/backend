# /src/scripts/classify_news.py

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

import psycopg2
import pandas as pd
from model.classify_module import predict_categories_with_representatives, clean_text
import joblib
from dotenv import load_dotenv
from datetime import datetime
# .env에서 DB 설정 로드
load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "dbname": os.getenv("DB_NAME"),
}

def load_unclassified_news(conn):
    query = """
    SELECT id, title, content
    FROM news_raw
    WHERE id NOT IN (
        SELECT DISTINCT news_id FROM news_classification
    )
    ORDER BY id
    LIMIT 100
    """
    return pd.read_sql(query, conn)

def insert_classification(conn, news_id, category, representative):
    query = """
    INSERT INTO news_classification (news_id, category, representative, classified_at)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (news_id, category) DO NOTHING
    """
    now = datetime.now()
    with conn.cursor() as cur:
        cur.execute(query, (news_id, category, representative, now))

def main():
    print(" 뉴스 분류 시작")

    # DB 연결
    conn = psycopg2.connect(**DB_CONFIG)

    # 분류할 뉴스 로드
    df = load_unclassified_news(conn)
    print(f" 총 {len(df)}건의 뉴스 로드됨")

    for _, row in df.iterrows():
        news_id = row['id']
        title = row['title']
        content = row['content']

        predictions = predict_categories_with_representatives(title, content)

        for pred in predictions:
            category = pred['category']
            representative = pred['representative']
            insert_classification(conn, news_id, category, representative)

    conn.commit()
    conn.close()
    print(" 모든 분류 결과 저장 완료")

if __name__ == "__main__":
    main()
