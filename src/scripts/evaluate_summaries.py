# src/scripts/evaluateSummaries.py
# pip install psycopg2-binary rouge-score nltk python-dotenv
# python -c "import nltk; nltk.download('punkt')"

import psycopg2
from rouge_score import rouge_scorer
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
import os
from dotenv import load_dotenv
from collections import Counter

# 평가 기준: 수준별 BLEU 기준
BLEU_THRESHOLDS = {
    '초급': 0, #초급은 BLEU 기준 없음. 쉬운 단어로 바꾸기 때문문
    '중급': 0.001,
    '고급': 0.001
}

# 반복 단어가 많은지 확인
def is_redundant(summary):
    words = summary.split()
    word_counts = Counter(words)
    most_common_word, freq = word_counts.most_common(1)[0]
    return freq > len(words) * 0.3  # 30% 이상이 동일 단어면 의심

# 1. 환경변수 로드 및 DB 연결
load_dotenv()
conn = psycopg2.connect(
    host=os.getenv("DB_HOST"),
    database=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    port=os.getenv("DB_PORT")
)
cursor = conn.cursor()

# 2. 평가할 뉴스 요약 불러오기 (reference 있으면 우선 사용)
cursor.execute("""
    SELECT ns.news_id, ns.level, ns.summary,
           COALESCE(nrs.reference, nr.content) AS reference_source,
           (nrs.reference IS NOT NULL) AS has_reference
    FROM news_summary ns
    JOIN news_raw nr ON ns.news_id = nr.id
    LEFT JOIN news_reference_summary nrs
      ON ns.news_id = nrs.news_id AND ns.level = nrs.level
    WHERE ns.rouge1 IS NULL OR ns.bleu IS NULL
    LIMIT 50
""")
rows = cursor.fetchall()

# 3. 평가 도구 설정
scorer = rouge_scorer.RougeScorer(['rouge1', 'rougeL'], use_stemmer=True)
smooth_fn = SmoothingFunction().method1

# 4. 평가 및 DB 업데이트
for news_id, level, summary, reference_source, has_reference in rows:
    ref = reference_source.strip().replace('\n', ' ')
    if not has_reference:
        ref = ref[:1000]

    hyp = summary.strip().replace('\n', ' ')

    try:
        rouge_scores = scorer.score(ref, hyp)
        rouge1_f = round(rouge_scores['rouge1'].fmeasure, 4)
        rougeL_f = round(rouge_scores['rougeL'].fmeasure, 4)
        bleu_score = round(sentence_bleu([ref.split()], hyp.split(), smoothing_function=smooth_fn), 4)

        cursor.execute("""
            UPDATE news_summary
            SET rouge1 = %s, rougeL = %s, bleu = %s
            WHERE news_id = %s AND level = %s
        """, (rouge1_f, rougeL_f, bleu_score, news_id, level))

        tag = "🧠 기준 요약 기반" if has_reference else "📄 원문 proxy 평가"
        print(f"✅ 뉴스 {news_id} [{level}] 평가 완료 {tag} → ROUGE-1: {rouge1_f}, BLEU: {bleu_score}")

        # 평가 기준에 따라 품질 의심 여부 판단
        bleu_threshold = BLEU_THRESHOLDS.get(level, 0.01)
        is_too_short = len(hyp) < 40
        is_repetitive = is_redundant(hyp)
        is_bleu_low = bleu_score < bleu_threshold
        is_rouge_low = rouge1_f < 0.1

        if is_bleu_low or is_rouge_low or is_too_short or is_repetitive:
            reasons = []
            if is_bleu_low:
                reasons.append(f"BLEU < {bleu_threshold}")
            if is_rouge_low:
                reasons.append("ROUGE-1 < 0.1")
            if is_too_short:
                reasons.append("요약 너무 짧음")
            if is_repetitive:
                reasons.append("같은 단어 반복")

            print(f"⚠️ 뉴스 {news_id} [{level}] 요약 품질 의심 → {' / '.join(reasons)}")

    except Exception as e:
        print(f"❌ 뉴스 {news_id} [{level}] 평가 실패:", str(e))

# 5. 마무리
conn.commit()
cursor.close()
conn.close()
