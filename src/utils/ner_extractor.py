# src/utils/ner_extractor.py
import sys
import json
from transformers import pipeline, AutoTokenizer, AutoModelForTokenClassification

text = sys.stdin.read()

model = AutoModelForTokenClassification.from_pretrained("monologg/koelectra-base-v3-finetuned-kor-naver-ner")
tokenizer = AutoTokenizer.from_pretrained("monologg/koelectra-base-v3-finetuned-kor-naver-ner")
ner = pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="simple")

results = ner(text)
terms = sorted({r['word'] for r in results}, key=lambda x: -len(x))
print(json.dumps(terms, ensure_ascii=False))
