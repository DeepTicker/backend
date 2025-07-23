# /src/scripts/classify_news_v2.py

import sys
import os
import time
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

import psycopg2
import pandas as pd
from model.classify_module_optimized import predict_categories_with_entities, save_classification_to_db
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
    """분류되지 않은 뉴스 로드"""
    query = """
    SELECT id, title, content
    FROM news_raw
    WHERE id NOT IN (
        SELECT DISTINCT news_id FROM news_classification
    )
    ORDER BY id
    """
    return pd.read_sql(query, conn)

def main():
    print("🚀 새로운 뉴스 분류 시스템 시작", flush=True)

    # DB 연결
    conn = psycopg2.connect(**DB_CONFIG)

    # 분류할 뉴스 로드
    df = load_unclassified_news(conn)
    print(f"📄 총 {len(df)}건의 뉴스 로드됨", flush=True)

    count = 0
    for _, row in df.iterrows():
        news_id = row['id']
        title = row['title']
        content = row['content']

        print(f"\n📰 [{count+1}/{len(df)}] 뉴스 {news_id} 분류 중...", flush=True)
        print(f"제목: {title[:50]}...", flush=True)

        try:
            # 새로운 분류 시스템으로 분류
            classifications = predict_categories_with_entities(title, content)
            
            # 분류 결과 출력
            print(f"✅ 분류 완료: {len(classifications)}개 분류", flush=True)
            for cls in classifications:
                category = cls['category']
                confidence = cls.get('confidence', 0.0)
                
                if category == '개별주':
                    print(f"  - {category}: {cls['stock_code']} [신뢰도: {confidence:.2f}]", flush=True)
                elif category == '전반적':
                    print(f"  - {category}: {cls['macro_category_code']} [신뢰도: {confidence:.2f}]", flush=True)
                    print(f"    원인: {cls['macro_cause'][:50]}...", flush=True)
                    print(f"    결과: {cls['macro_effect'][:50]}...", flush=True)
                elif category in ['산업군', '테마']:
                    entity_name = cls.get('industry_name') or cls.get('theme_name')
                    print(f"  - {category}: {entity_name} [신뢰도: {confidence:.2f}]", flush=True)
                else:
                    print(f"  - {category} [신뢰도: {confidence:.2f}]", flush=True)

            # DB에 저장
            save_classification_to_db(news_id, classifications)
            
        except Exception as e:
            print(f"❌ 뉴스 {news_id} 분류 실패: {e}", flush=True)
            continue

        count += 1

        # API 호출 제한을 위한 대기 (4초 간격)
        print(f"⏳ 4초 대기...", flush=True)
        time.sleep(4)

    conn.close()
    print(f"\n🎉 분류 작업 완료! 총 {count}건 처리됨", flush=True)

if __name__ == "__main__":
    main() 