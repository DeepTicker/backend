# /src/scripts/classify_news.py

import sys
import os
import time
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

import psycopg2
import pandas as pd
from model.classify_module import predict_categories_with_representatives, clean_text
import joblib
from dotenv import load_dotenv
from datetime import datetime
from config.db_conn import get_db_connection

def load_unclassified_news(conn):
    query = """
    SELECT id, title, content
    FROM news_raw
    WHERE id NOT IN (
        SELECT DISTINCT news_id FROM news_classification
    )
    ORDER BY id
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
    print("뉴스 분류 시작", flush=True)

    # DB 연결
    conn = get_db_connection() #config/db_conn.py에서 가져오기

    # 분류할 뉴스 로드
    df = load_unclassified_news(conn)
    print(f"총 {len(df)}건의 뉴스 로드됨", flush=True)

    count = 0
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
        count += 1

        print(f"{count}건 처리됨 (id={news_id})", flush=True)

        # 1분에 15개 이하 처리 (4초 간격)
        time.sleep(4)

    conn.close()
    print("모든 분류 결과 저장 완료", flush=True)

if __name__ == "__main__":
    main()
