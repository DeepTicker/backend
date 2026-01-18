# src/utils/db_conn.py
import os
import psycopg2
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

def get_db_connection():
    database_url = os.getenv("DATABASE_URL")

    #배포용
    if database_url:
        print("🚀 [DB 연결] 배포 모드", flush=True)
        conn = psycopg2.connect(database_url, sslmode="require")
        return conn

    #로컬 개발용
    else:
        print("[DB 연결] 로컬 모드 DB_HOST: ${os.getenv('DB_HOST')}", flush=True)
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            dbname=os.getenv("DB_NAME"),
        )
        return conn