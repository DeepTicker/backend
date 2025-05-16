import os
import psycopg2
import google.generativeai as genai
from dotenv import load_dotenv
import re

# 환경변수 로드
load_dotenv()

# Gemini 설정
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

# PostgreSQL 연결
conn = psycopg2.connect(
    dbname=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host=os.getenv("DB_HOST"),
    port=os.getenv("DB_PORT"),
)
cursor = conn.cursor()

# 캐치프레이즈 생성 및 저장 함수
def generate_and_store_catchphrases(stock_id):
    # 예측 데이터 조회
    cursor.execute("""
        SELECT predict_day, predicted_close
        FROM stock_prediction_result
        WHERE stock_id = %s
        ORDER BY predict_day ASC
    """, (stock_id,))
    rows = cursor.fetchall()

    if not rows:
        print(f"⚠️ 예측 데이터 없음: stock_id={stock_id}")
        return

    formatted = '\n'.join([f"{r[0]}: {r[1]}" for r in rows])
    print(f"📊 stock_id={stock_id} 예측 데이터:\n{formatted}")

    prompt = f"""
        다음은 주식의 30일 예측 종가 데이터야:
        {formatted}

        이 데이터를 기반으로 창의적이고 재치 있는 캐치프레이즈를 **1개만** 써줘. 
        중복 없이 짧고 강렬한 문장으로 표현해줘. 마크다운 없이 순수 텍스트로 부탁해.
    """

    try:
        response = model.generate_content(prompt)
        text = response.text
    except Exception as e:
        print(f"❌ Gemini 호출 실패 (stock_id={stock_id}):", e)
        return

    print("📥 Gemini 응답 원문:\n", text)

    # 마크다운 제거 및 파싱
    cleaned_text = re.sub(r'\*\*', '', text)

    print(f"🎯 파싱된 캐치프레이즈: {cleaned_text}")

    # 저장 (insert or update)
    cursor.execute("""
        INSERT INTO stock_catchphrases (stock_id, phrase)
        VALUES (%s, %s)
        ON CONFLICT (stock_id)
        DO UPDATE SET phrase = EXCLUDED.phrase;
    """, (stock_id, cleaned_text))


    conn.commit()
    print(f"✅ stock_id={stock_id} 캐치프레이즈 저장 완료")

# ------------------------------------------------------------
# 상위 5개 stock_id 추출 후 처리
# ------------------------------------------------------------
cursor.execute("""
    SELECT stock_id
    FROM stock_data
    ORDER BY volume DESC
    LIMIT 5;
""")
top_stocks = cursor.fetchall()

for (stock_id,) in top_stocks:
    generate_and_store_catchphrases(stock_id)

cursor.close()
conn.close()
print("✅ 모든 캐치프레이즈 생성 및 저장 완료")
