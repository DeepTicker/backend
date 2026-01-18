# src/scripts/test.py
# 현재 사용할 수 있는 gemini 모델 리스트

from google import genai
import os
from dotenv import load_dotenv
load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

models = client.models.list()
for m in models:
    print(m.name)