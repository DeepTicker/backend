# src/utils/ner_extractor.py
import sys
import json
from transformers import pipeline, AutoTokenizer, AutoModelForTokenClassification

# 1. 입력
text = sys.stdin.read()

# 2. 모델 로드
model_name = "KPF/KPF-bert-ner"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForTokenClassification.from_pretrained(model_name)

# 3. pipeline 생성
ner = pipeline(
    "ner",
    model=model,
    tokenizer=tokenizer,
    aggregation_strategy="simple"
)

# 4. 최대 토큰 길이 제한 (BERT 계열은 512)
max_tokens = 510
tokens = tokenizer.tokenize(text)

chunks = []
while tokens:
    chunk = tokens[:max_tokens]
    tokens = tokens[max_tokens:]
    chunk_text = tokenizer.convert_tokens_to_string(chunk)
    chunks.append(chunk_text)

# 5. 각 chunk별로 NER 수행
results = []
for chunk in chunks:
    try:
        results.extend(ner(chunk))
    except Exception as e:
        print(f"[WARN] Chunk skipped due to error: {e}", file=sys.stderr)

# 6. 고유 단어 추출 및 출력
terms = sorted({r['word'] for r in results}, key=lambda x: -len(x))
print(json.dumps(terms, ensure_ascii=False))
