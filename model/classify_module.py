import os
import joblib
import psycopg2
import pandas as pd
import numpy as np    
from transformers import AutoTokenizer, AutoModel
import torch
import re
import json
from dotenv import load_dotenv
from google import genai
import time

# ---------------------------
# 0. 기본 설정
# ---------------------------
load_dotenv()
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
multi_clf = joblib.load(os.path.join(BASE_DIR, "model", "news_category_classifier.pkl"))
mlb = joblib.load(os.path.join(BASE_DIR, "model", "multilabel_binarizer.pkl"))

MODEL_NAME = 'klue/roberta-small'
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
bert = AutoModel.from_pretrained(MODEL_NAME).to(device)

# Gemini 설정
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# DB 연결 - 로컬 개발용
# DB_CONFIG = {
#     "host": os.getenv("DB_HOST"),
#     "port": os.getenv("DB_PORT"),
#     "user": os.getenv("DB_USER"),
#     "password": os.getenv("DB_PASSWORD"),
#     "dbname": os.getenv("DB_NAME"),
# }

# def get_stock_data():
#     """DB에서 테마/업종/종목명 데이터 로드"""
#     conn = psycopg2.connect(**DB_CONFIG)
#     df = pd.read_sql("SELECT stock_code, stock_name, themes, industry_group FROM tmp_stock", conn)
#     conn.close()
#     return df


# DB 연결 - 배포용
DATABASE_URL = os.getenv("DATABASE_URL")

def get_stock_data():
    conn = psycopg2.connect(
        DATABASE_URL,
        sslmode="require"
    )
    df = pd.read_sql("SELECT stock_code, stock_name, themes, industry_group FROM tmp_stock", conn)
    conn.close()
    return df


# 초기화 시 로딩
df_stock = get_stock_data()
industry_list = df_stock['industry_group'].dropna().unique().tolist()
theme_list = sorted({theme for t in df_stock['themes'] for theme in t if isinstance(t, list)})

# ---------------------------
# 1. 전처리
# ---------------------------
def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^가-힣a-zA-Z0-9 .,]', '', text)
    return text.strip()

# ---------------------------
# 2. BERT 임베딩
# ---------------------------
def embed_text(texts, batch_size=32):
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i+batch_size]
        inputs = tokenizer(batch_texts, return_tensors='pt', padding=True,
                           truncation=True, max_length=128).to(device)
        with torch.no_grad():
            outputs = bert(**inputs)
        last_hidden_state = outputs[0] #output이 tuple으로 변경됨
        embeddings = last_hidden_state.mean(dim=1).cpu().numpy()
        all_embeddings.append(embeddings)
    return np.vstack(all_embeddings)

# ---------------------------
# 3. 종목 정보 찾기
# ---------------------------
def find_stock_info(title, body):
    combined_text = title + " " + body
    for _, row in df_stock.iterrows():
        name = row['stock_name']
        if name and name in combined_text:
            return {
                "종목명": name,
                "업종명": row["industry_group"] or "",
                "테마명": (row["themes"] or [])[0] if isinstance(row["themes"], list) and row["themes"] else ""
            }
    return None



# ---------------------------
# 3.5 전반적 -> 후처리 필요
# ---------------------------
def extract_clean_representative(category, response_text):
    response_text = response_text.strip("`\n ")

    try:
        parsed = json.loads(response_text)
        return parsed.get({
            "전반적": "summary",
            "테마": "theme",
            "산업군": "industry"
        }.get(category, ""), None)
    except:
        pass

    if category == "전반적":
        match = re.search(r'"summary"\s*:\s*"(.+?)"', response_text)
        if match:
            return match.group(1), None
        match = re.search(r'["“](.+?)["”]', response_text)
        if match:
            return match.group(1), None
        return response_text[:40], None
    return response_text.strip(), None



# ---------------------------
# 4. 대표 키워드 생성
# ---------------------------
def generate_representative(title, body, category, stock_info=None):
    if not isinstance(body, str):
        body = ""

    hint = ""
    if stock_info:
        hint = f"""
힌트:
- 이 뉴스에 언급된 종목은 \"{stock_info['종목명']}\"입니다.
- 이 종목의 업종은 \"{stock_info['업종명']}\"이며, 주요 테마는 \"{stock_info['테마명']}\"입니다.
"""

    if category == "개별주":
        prompt = f"""
다음 뉴스 기사에서 언급된 주식 종목명을 최대 3개까지만 추출해주세요. 쉼표로 구분해주세요.
{hint}
제목: {title}
본문: {body[:500]}
JSON:
{{ "stocks": ["종목1", "종목2"] }}
"""
    elif category == "산업군":
        prompt = f"""
다음 뉴스 기사에서 관련성 가장 높은 업종명을 아래 업종 목록 중 하나만 선택해서 반환해주세요. 반드시 이름만 출력하세요.
{hint}
업종 목록: {', '.join(industry_list)}
제목: {title}
본문: {body[:500]}
JSON:
{{ "industry": "업종명" }}
"""
    elif category == "테마":
        prompt = f"""
다음 뉴스 기사에서 관련성 가장 높은 테마명을 아래 테마 목록 중 하나만 선택해서 반환해주세요. 반드시 이름만 출력하세요.
{hint}
테마 목록: {', '.join(theme_list)}
제목: {title}
본문: {body[:500]}
JSON:
{{ "theme": "테마명" }}
"""
    elif category == "전반적":
        prompt = f"""
다음 뉴스 기사의 내용을 원인->결과 형태로 요약하거나, 핵심 키워드를 20자 이내로 작성해주세요.
제목: {title}
본문: {body[:500]}
JSON:
{{ "summary": "요약문 또는 핵심 키워드" }}
"""
    else:
        return None, None

    try:
        time.sleep(6)
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt
        )
        response_text = response.text.strip()
        try:
            result = json.loads(response_text)
            if category == "개별주" and "stocks" in result:
                if len(result["stocks"]) > 3:
                    return None, "산업군"
                return ", ".join(result["stocks"]), None
            elif category == "산업군" and "industry" in result:
                return result["industry"], None
            elif category == "테마" and "theme" in result:
                return result["theme"], None
            elif category == "전반적" and "summary" in result:
                return result["summary"], None
        except json.JSONDecodeError:
            return extract_clean_representative(category, response_text)
    except Exception as e:
        print(f"Gemini API 오류: {e}")
        return None, None

# ---------------------------
# 5. 예측 함수
# ---------------------------
def predict_categories_with_representatives(title, body, threshold=0.3):
    cleaned_body = clean_text(body)
    text = title + " " + cleaned_body
    stock_info = find_stock_info(title, cleaned_body)
    vec = embed_text([text])
    y_proba = multi_clf.predict_proba(vec)

    results = []
    for i, category in enumerate(mlb.classes_):
        prob = y_proba[i][0][1]
        if prob >= threshold:
            representative, new_cat = generate_representative(title, cleaned_body, category, stock_info)
            final_category = new_cat if new_cat else category
            if new_cat:
                representative, _ = generate_representative(title, cleaned_body, new_cat, stock_info)
            results.append({
                "category": final_category,
                "representative": representative,
                "prob": prob
            })

    if not results:
        results.append({
            "category": "그 외",
            "representative": None,
            "prob": 0.0
        })

    return results
