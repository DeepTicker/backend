# scripts/rebuild_news_meta.py

import pandas as pd
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
import os

# ✅ 파일 경로
CSV_PATH = "data/past_news.csv"
INDEX_PATH = "src/data/embedding/news_index.faiss"
META_PATH = "src/data/embedding/news_meta.pkl"

# ✅ 데이터 로드
print("뉴스 데이터 로딩 중...")
df_news = pd.read_csv(CSV_PATH)

# ✅ 모델 로드
print("임베딩 모델 로드 중...")
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# ✅ 임베딩 수행
print("뉴스 임베딩 중...")
df_news['embedding'] = df_news['본문정리'].apply(lambda x: model.encode(str(x)))
emb_matrix = np.stack(df_news['embedding'].values)

# ✅ FAISS 인덱스 생성 및 저장
print("FAISS 인덱스 생성 중...")
os.makedirs(os.path.dirname(INDEX_PATH), exist_ok=True)
index = faiss.IndexFlatL2(emb_matrix.shape[1])
index.add(emb_matrix)
faiss.write_index(index, INDEX_PATH)

# ✅ 메타데이터 저장
print("메타데이터 저장 중...")
df_news[['제목', '날짜', '본문정리', 'embedding']].to_pickle(META_PATH)

print("news_index.faiss 와 news_meta.pkl 생성 완료!")
