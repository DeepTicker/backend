# src/services/retrieval.py

import faiss
import pandas as pd
import numpy as np
from services.embedding import encode_text

def load_index(index_path: str):
    return faiss.read_index(index_path)

def load_meta(meta_path: str):
    return pd.read_pickle(meta_path)

def search_similar_news(query: str, index, df_meta, top_k: int = 5):
    query_vec = encode_text(query).reshape(1, -1)
    _, indices = index.search(query_vec, top_k)
    return df_meta.iloc[indices[0]][['제목', '날짜']].to_dict(orient="records")
