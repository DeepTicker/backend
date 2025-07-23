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
import google.generativeai as genai
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
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini = genai.GenerativeModel("gemini-1.5-flash")

# DB 연결
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "dbname": os.getenv("DB_NAME"),
}

def get_stock_data():
    """DB에서 테마/업종/종목명 데이터 로드"""
    conn = psycopg2.connect(**DB_CONFIG)
    df = pd.read_sql("SELECT stock_code, stock_name, themes, industry_group FROM tmp_stock", conn)
    conn.close()
    return df

def get_macro_categories():
    """거시경제 분류 체계 로드"""
    conn = psycopg2.connect(**DB_CONFIG)
    df = pd.read_sql("SELECT category_code, category_name, description, examples FROM macro_category_master", conn)
    conn.close()
    return df

# 전역 데이터 로드
stock_df = get_stock_data()
macro_df = get_macro_categories()
industry_list = stock_df['industry_group'].dropna().unique().tolist()
theme_list = []
for themes in stock_df['themes'].dropna():
    if isinstance(themes, list):
        theme_list.extend(themes)
theme_list = list(set(theme_list))

def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = re.sub(r'[^\w\s가-힣]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def embed_text(texts, batch_size=32):
    embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        inputs = tokenizer(batch, padding=True, truncation=True, max_length=512, return_tensors='pt').to(device)
        with torch.no_grad():
            outputs = bert(**inputs)
            batch_embeddings = outputs.last_hidden_state.mean(dim=1).cpu().numpy()
        embeddings.append(batch_embeddings)
    return np.vstack(embeddings)

def find_stock_info(title, body):
    """뉴스에서 주식 정보 찾기"""
    text = title + " " + body
    for _, row in stock_df.iterrows():
        if row['stock_name'] in text:
            themes = row['themes'] if isinstance(row['themes'], list) else []
            return {
                '종목명': row['stock_name'],
                '종목코드': row['stock_code'],
                '업종명': row['industry_group'],
                '테마명': ', '.join(themes) if themes else '없음'
            }
    return None

# ---------------------------
# 개별주 처리 (새로운 방식)
# ---------------------------
def extract_stock_entities(title, body, stock_info=None):
    """뉴스에서 주식 엔티티들을 추출하고 주식코드 매핑"""
    
    hint = ""
    if stock_info:
        hint = f"""
힌트:
- 이 뉴스에 언급된 종목: "{stock_info['종목명']}" (코드: {stock_info['종목코드']})
- 업종: "{stock_info['업종명']}", 테마: "{stock_info['테마명']}"
"""

    prompt = f"""
다음 뉴스 기사에서 언급된 주식 종목들을 추출해주세요. 각 종목에 대해 정확한 종목명을 제공해주세요.
{hint}

제목: {title}
본문: {body[:800]}

추출 조건:
1. 구체적인 기업명만 추출 (예: 삼성전자, LG화학)
2. 최대 5개까지만 추출
3. 정확한 종목명 사용

JSON 형식으로 답변:
{{
    "stocks": [
        {{"name": "삼성전자", "confidence": 0.95}},
        {{"name": "LG화학", "confidence": 0.80}}
    ]
}}
"""

    try:
        time.sleep(4)
        response = gemini.generate_content(prompt)
        response_text = response.text.strip()
        
        # JSON 파싱
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            stocks = data.get('stocks', [])
            
            # 주식코드 매핑
            result = []
            for stock_item in stocks:
                stock_name = stock_item.get('name', '').strip()
                confidence = stock_item.get('confidence', 0.0)
                
                # DB에서 주식코드 찾기
                stock_row = stock_df[stock_df['stock_name'] == stock_name]
                if not stock_row.empty:
                    result.append({
                        'stock_code': stock_row.iloc[0]['stock_code'],
                        'confidence': confidence
                    })
                else:
                    # 유사한 종목명 찾기
                    similar_stocks = stock_df[stock_df['stock_name'].str.contains(stock_name[:3], na=False)]
                    if not similar_stocks.empty:
                        result.append({
                            'stock_code': similar_stocks.iloc[0]['stock_code'],
                            'confidence': confidence * 0.7  # 유사 매칭이므로 신뢰도 감소
                        })
            
            return result
            
    except Exception as e:
        print(f"주식 추출 오류: {e}")
        return []
    
    return []

# ---------------------------
# 거시경제 분류 (새로운 방식)
# ---------------------------
def classify_macro_news(title, body):
    """거시경제 뉴스를 A1~A18 카테고리로 분류하고 원인/결과 분석"""
    
    # 분류 체계 정보 구성
    categories_info = ""
    for _, row in macro_df.iterrows():
        examples = ", ".join(row['examples'][:3]) if row['examples'] else ""
        categories_info += f"- {row['category_code']}: {row['category_name']} (예: {examples})\n"
    
    prompt = f"""
다음 뉴스를 거시경제 분류 체계에 따라 분석해주세요.

분류 체계:
{categories_info}

제목: {title}
본문: {body[:1000]}

분석 요청:
1. 가장 적합한 분류 코드 선택 (A1~A18)
2. 구체적인 원인(세부분류) 기술
3. 예상되는 결과/영향 분석

JSON 형식으로 답변:
{{
    "category_code": "A1",
    "cause": "미 연준의 기준금리 0.25%p 인상 결정",
    "effect": "국내 금리 상승 압력 증가, 성장주 밸류에이션 부담 확대",
    "confidence": 0.90
}}
"""

    try:
        time.sleep(5)
        response = gemini.generate_content(prompt)
        response_text = response.text.strip()
        
        # JSON 파싱
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            
            # 유효성 검증
            category_code = data.get('category_code', '')
            if category_code in macro_df['category_code'].values:
                return {
                    'category_code': category_code,
                    'cause': data.get('cause', '').strip(),
                    'effect': data.get('effect', '').strip(),
                    'confidence': data.get('confidence', 0.0)
                }
                
    except Exception as e:
        print(f"거시경제 분류 오류: {e}")
        
    return None

# ---------------------------
# 산업군/테마 처리 (기존 로직 유지)
# ---------------------------
def extract_industry_or_theme(title, body, category):
    """산업군 또는 테마 추출"""
    
    if category == "산업군":
        target_list = industry_list
        target_name = "업종"
    elif category == "테마":
        target_list = theme_list
        target_name = "테마"
    else:
        return None
        
    prompt = f"""
다음 뉴스 기사에서 관련성이 가장 높은 {target_name}명을 아래 목록 중 하나만 선택해서 반환해주세요.

{target_name} 목록: {', '.join(target_list[:20])}  # 너무 길면 처음 20개만

제목: {title}
본문: {body[:500]}

JSON 형식으로 답변:
{{ "{target_name.lower()}": "{target_name}명" }}
"""

    try:
        time.sleep(4)
        response = gemini.generate_content(prompt)
        response_text = response.text.strip()
        
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            result = list(data.values())[0] if data else None
            return result.strip() if result else None
            
    except Exception as e:
        print(f"{category} 추출 오류: {e}")
        
    return None

# ---------------------------
# 메인 분류 함수 (새로운 구조)
# ---------------------------
def predict_categories_with_entities(title, body, threshold=0.3):
    """뉴스 분류 및 엔티티 추출 (새로운 구조)"""
    
    cleaned_body = clean_text(body)
    text = title + " " + cleaned_body
    stock_info = find_stock_info(title, cleaned_body)
    
    # 기존 분류 모델로 카테고리 예측
    vec = embed_text([text])
    y_proba = multi_clf.predict_proba(vec)

    results = []
    
    for i, category in enumerate(mlb.classes_):
        prob = y_proba[i][0][1]
        if prob >= threshold:
            
            if category == "개별주":
                # 개별주: 각 주식을 별도로 처리
                stocks = extract_stock_entities(title, cleaned_body, stock_info)
                for stock in stocks:
                    results.append({
                        "category": "개별주",
                        "stock_code": stock['stock_code'],
                        "confidence": prob * stock['confidence']
                    })
                    
            elif category == "전반적":
                # 거시경제: A1~A18 분류 + 원인/결과
                macro_analysis = classify_macro_news(title, cleaned_body)
                if macro_analysis:
                    results.append({
                        "category": "전반적",
                        "macro_category_code": macro_analysis['category_code'],
                        "macro_cause": macro_analysis['cause'],
                        "macro_effect": macro_analysis['effect'],
                        "confidence": prob * macro_analysis['confidence']
                    })
                    
            elif category == "산업군":
                industry = extract_industry_or_theme(title, cleaned_body, "산업군")
                if industry:
                    results.append({
                        "category": "산업군",
                        "industry_name": industry,
                        "confidence": prob
                    })
                    
            elif category == "테마":
                theme = extract_industry_or_theme(title, cleaned_body, "테마")
                if theme:
                    results.append({
                        "category": "테마",
                        "theme_name": theme,
                        "confidence": prob
                    })

    # 분류 결과가 없으면 '그 외'로 분류
    if not results:
        results.append({
            "category": "그 외",
            "confidence": 0.0
        })

    return results

# ---------------------------
# DB 저장 함수 (새로운 구조)
# ---------------------------
def save_classification_to_db(news_id, classifications):
    """새로운 스키마에 분류 결과 저장"""
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    try:
        for classification in classifications:
            category = classification['category']
            confidence = classification.get('confidence', 0.0)
            
            if category == "개별주":
                cursor.execute("""
                    INSERT INTO news_classification 
                    (news_id, category, stock_code, confidence_score)
                    VALUES (%s, %s, %s, %s)
                """, (
                    news_id, category,
                    classification['stock_code'],
                    confidence
                ))
                
            elif category == "전반적":
                cursor.execute("""
                    INSERT INTO news_classification 
                    (news_id, category, macro_category_code, macro_cause, macro_effect, confidence_score)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    news_id, category,
                    classification['macro_category_code'],
                    classification['macro_cause'],
                    classification['macro_effect'],
                    confidence
                ))
                
            elif category == "산업군":
                cursor.execute("""
                    INSERT INTO news_classification 
                    (news_id, category, industry_name, confidence_score)
                    VALUES (%s, %s, %s, %s)
                """, (
                    news_id, category,
                    classification['industry_name'],
                    confidence
                ))
                
            elif category == "테마":
                cursor.execute("""
                    INSERT INTO news_classification 
                    (news_id, category, theme_name, confidence_score)
                    VALUES (%s, %s, %s, %s)
                """, (
                    news_id, category,
                    classification['theme_name'],
                    confidence
                ))
                
            elif category == "그 외":
                cursor.execute("""
                    INSERT INTO news_classification 
                    (news_id, category, confidence_score)
                    VALUES (%s, %s, %s)
                """, (
                    news_id, category, confidence
                ))
        
        conn.commit()
        print(f"뉴스 {news_id} 분류 결과 저장 완료")
        
    except Exception as e:
        conn.rollback()
        print(f"DB 저장 오류: {e}")
        
    finally:
        cursor.close()
        conn.close() 