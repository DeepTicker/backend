# import psycopg2
# from psycopg2 import sql
# import pandas as pd
# import numpy as np
# from sklearn.preprocessing import StandardScaler
# from sklearn.cluster import KMeans
# from sklearn.metrics.pairwise import euclidean_distances
# import schedule
# import time

# # PostgreSQL 데이터베이스 연결 설정
# def connect_db():
#     conn = psycopg2.connect(
        
#     )
#     return conn

# # 2. 10일간 평균 수익률 계산 및 클러스터링 처리
# def process_and_insert():
#     df = pd.read_excel('krx_1000_changerate_marketcap.xlsx')

#     # 10일간 평균 수익률 계산
#     change_cols = [f'Change_{i}' for i in range(1, 6)]
#     df['Avg_change'] = df[change_cols].mean(axis=1)

#     # 피처 선택 및 정규화
#     X = df[['Avg_change', 'MarCap']].copy()
#     scaler = StandardScaler()
#     X_scaled = scaler.fit_transform(X)

#     # KMeans 클러스터링
#     k = 5
#     kmeans = KMeans(n_clusters=k, random_state=42)
#     df['cluster'] = kmeans.fit_predict(X_scaled)

#     # 거리 행렬 계산
#     distances = euclidean_distances(X_scaled, X_scaled)

#     # 유사 종목 3개 찾기 (같은 클러스터 내에서)
#     similar_1, similar_2, similar_3 = [], [], []
#     for idx in range(len(df)):
#         cluster = df.loc[idx, 'cluster']
#         same_cluster_idx = df[df['cluster'] == cluster].index
#         dists = [(i, distances[idx][i]) for i in same_cluster_idx if i != idx]
#         dists.sort(key=lambda x: x[1])
#         similar = [df.loc[i, '종목명'] for i, _ in dists[:3]]
#         while len(similar) < 3:
#             similar.append(None)  # 부족할 경우 None 채우기
#         similar_1.append(similar[0])
#         similar_2.append(similar[1])
#         similar_3.append(similar[2])

#     df['similar_1'] = similar_1
#     df['similar_2'] = similar_2
#     df['similar_3'] = similar_3

#     # 클러스터별 평균 계산
#     cluster_summary = df.groupby('cluster')[['Avg_change', 'MarCap']].mean()

#     # 전체 평균
#     avg_return_all = df['Avg_change'].mean()
#     avg_cap_all = df['MarCap'].mean()

#     # 이름 붙이는 함수
#     def assign_cluster_label(avg_change, market_cap):
#         if market_cap > avg_cap_all and avg_change > avg_return_all:
#             return '고수익 대형주'
#         elif market_cap > avg_cap_all and avg_change <= avg_return_all:
#             return '안정 대형주'
#         elif market_cap <= avg_cap_all and avg_change > avg_return_all:
#             return '고성장 소형주'
#         elif market_cap <= avg_cap_all and avg_change <= avg_return_all:
#             return '침체 소형주'
#         else:
#             return '중립'

#     # 클러스터별 이름 매핑 딕셔너리 생성
#     cluster_labels = {
#         idx: assign_cluster_label(row['Avg_change'], row['MarCap'])
#         for idx, row in cluster_summary.iterrows()
#     }

#     # 클러스터 이름 열 추가
#     df['cluster_name'] = df['cluster'].map(cluster_labels)

#     # PostgreSQL DB에 데이터 삽입
#     conn = connect_db()
#     cursor = conn.cursor()

#     for idx, row in df.iterrows():
#         # stock_id와 유사 종목들을 데이터베이스에 삽입
#         cursor.execute(
#             sql.SQL("""
#                 INSERT INTO stock_recommendation (stock_id, similar_stock_id_1, similar_stock_id_2, similar_stock_id_3, 
#                 marcap, cluster_index, cluster_name, recommended_date)
#                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
#             """),
#             (row['종목코드'], 
#              df[df['종목명'] == row['similar_1']]['종목코드'].values[0] if pd.notna(row['similar_1']) else None,
#              df[df['종목명'] == row['similar_2']]['종목코드'].values[0] if pd.notna(row['similar_2']) else None,
#              df[df['종목명'] == row['similar_3']]['종목코드'].values[0] if pd.notna(row['similar_3']) else None,
#              row['MarCap'],
#              row['cluster'],
#              row['cluster_name'],
#              pd.to_datetime('today').date())
#         )
    
#     conn.commit()
#     cursor.close()
#     conn.close()
#     print("데이터베이스에 삽입 완료!")

# # 3. 매일 6시에 데이터 리프레시
# def job():
#     print("클러스터 데이터 리프레시 시작!")
#     process_and_insert()

# # 스케줄 설정 (매일 6시에 실행)
# schedule.every().day.at("18:00").do(job)

# while True:
#     schedule.run_pending()
#     time.sleep(60)  # 1분마다 체크

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
    # 1. 엑셀 파일 로드
    df = pd.read_excel(excel_path)

    # 2. DB 연결, 테이블 비우기
    conn = connect_db()
    cur = conn.cursor()
  
    cur.execute("TRUNCATE TABLE stock_recommendation;")
    print("⚠️ 기존 데이터가 비워졌습니다.")

    # 3. stock_id 반환 함수
    def get_stock_id_by_code(code):
        if pd.isna(code):
            return None
        cur.execute("SELECT stock_id FROM stock_data WHERE code = %s", (str(code),))
        result = cur.fetchone()
        return result[0] if result else None
    def get_stock_id_by_name(name):
        if pd.isna(name):
            return None
        cur.execute("SELECT stock_id FROM stock_data WHERE name = %s", (name,))
        result = cur.fetchone()
        return result[0] if result else None

    # 4. 데이터 삽입
    for _, row in df.iterrows():
        stock_code = row["기준종목코드"]
        similar_1 = row["similarity_stock_1_name"]
        similar_2 = row["similarity_stock_2_name"]
        similar_3 = row["similarity_stock_3_name"]

        stock_id = get_stock_id_by_code(stock_code)
        sim_id_1 = get_stock_id_by_name(similar_1)
        sim_id_2 = get_stock_id_by_name(similar_2)
        sim_id_3 = get_stock_id_by_name(similar_3)

        # stock_id가 존재할 때만 삽입
        if stock_id:
            cur.execute("""
                INSERT INTO stock_recommendation (
                    stock_id, similar_stock_id_1, similar_stock_id_2, similar_stock_id_3,
                    marcap, cluster_index, cluster_name, recommended_date
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                stock_id,
                sim_id_1,
                sim_id_2,
                sim_id_3,
                row["MarCap"],
                row["기준클러스터"],
                row["기준태그"],
                '2025-05-16'  
            ))

    conn.commit()
    cur.close()
    conn.close()
    print("📥 엑셀 데이터 삽입 완료!")

if __name__ == "__main__":
    excel_path = "../data/krx_stockrecoms.xlsx"  # 엑셀 파일 경로 수정
    upload_excel_to_db(excel_path)


