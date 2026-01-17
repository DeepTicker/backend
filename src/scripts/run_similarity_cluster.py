# src/scripts/run_similarity_cluster.py
# pip install faiss-cpu
# pip install sentence-transformers

import sys
import faiss
import pandas as pd
import json
import numpy as np
from sentence_transformers import SentenceTransformer
from datetime import timedelta
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Step 1. 입력 뉴스
query = sys.argv[1]
top_k = 20
window = 7
cluster_k = 3

# Step 2. 임베딩 + FAISS 로드
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
index = faiss.read_index("data/embedding/news_index.faiss")
df_meta = pd.read_pickle("data/embedding/news_meta.pkl")

# Step 3. 유사 뉴스 검색
query_vec = model.encode(query).reshape(1, -1)
_, indices = index.search(query_vec, top_k)
similar_df = df_meta.iloc[indices[0]].copy()
similar_df['similarity'] = 1.0  # 유사도 넣기 (가중치 미반영 시 고정)

# Step 4. 날짜 기반 클러스터링
similar_df['날짜'] = pd.to_datetime(similar_df['날짜'])
similar_df['cluster'] = similar_df['날짜'].dt.to_period(f'{window}D')

clustered = (
    similar_df
    .groupby('cluster', group_keys=False)
    .apply(lambda g: g.sort_values('similarity', ascending=False).head(1), include_groups=False)
    .reset_index(drop=True)
)

final = clustered.sort_values('similarity', ascending=False).head(cluster_k)

# Step 5. JSON 출력 - 여러 유사 뉴스 반환
if not final.empty:
    results = []
    for _, row in final.iterrows():
        results.append({
            "date": row["날짜"].strftime("%Y-%m-%d"),
            "title": row["제목"]
        })
    print(json.dumps(results, ensure_ascii=False))
else:
    print(json.dumps([]))
