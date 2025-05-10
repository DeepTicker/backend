
import torch
import torch.nn as nn
import pandas as pd
import numpy as np
import psycopg2
from datetime import datetime
from dotenv import load_dotenv
import os

# 모델 클래스 정의
import torch.nn as nn

class PatchTST(nn.Module):
    def __init__(self, input_dim, patch_size, n_patches, d_model, n_heads, num_layers):
        super().__init__()
        self.patch_size = patch_size
        self.input_dim = input_dim
        self.n_patches = n_patches
        self.d_model = d_model

        self.patch_embedding = nn.Linear(patch_size * input_dim, d_model)
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=n_heads, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.regressor = nn.Linear(d_model, 1)

    def forward(self, x):
        # x: (batch_size, seq_len, input_dim)
        B, L, D = x.shape
        x = x.reshape(B, self.n_patches, self.patch_size * D)  # patching
        x = self.patch_embedding(x)  # (B, n_patches, d_model)
        x = self.transformer(x)  # (B, n_patches, d_model)
        x = x.mean(dim=1)  # Global average pooling
        out = self.regressor(x).squeeze()
        return out

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "dbname": os.getenv("DB_NAME"),
}

def connect_db():
    return psycopg2.connect(**DB_CONFIG)

# DB 연결
print("✅ DB 연결 중...")
conn = connect_db()
cur = conn.cursor()
cur.execute("TRUNCATE TABLE stock_prediction_result;")
print("⚠️ stock_prediction_result 테이블의 기존 데이터가 비워졌습니다.")

# 1. 데이터 불러오기
print("✅ 데이터 불러오는 중...")
cur.execute("SELECT stock_id, " + ", ".join([f"close_{i}" for i in range(1, 31)]) + " FROM stock_close_sequence_scaled;")
rows = cur.fetchall()
print("✅ 데이터 불러오기 완료.")

# 2. 데이터 전처리
print("✅ 데이터 전처리 중...")
df = pd.DataFrame(rows, columns=["stock_id"] + [f"close_{i}" for i in range(1, 31)])
stock_ids = df["stock_id"]
scaled_data = df.drop("stock_id", axis=1).values  # 이미 scaled된 데이터 사용
scaled_data = scaled_data.reshape(scaled_data.shape[0], scaled_data.shape[1], 1)
print(scaled_data.shape)  # (num_samples, 30, 1) 형태로 변환
print("✅ 데이터 전처리 완료.")

# 3. 모델 로딩
print("✅ 모델 로딩 중...")
# 하이퍼파라미터
patch_size = 7  # 29를 n_patches=4, patch_size=7로 자를 수 있음
n_patches = 29 // patch_size
d_model = 64
n_heads = 4
num_layers = 2
epochs = 100
batch_size = 32
lr = 0.001

# 모델 초기화
model = PatchTST(input_dim=1, patch_size=patch_size, n_patches=n_patches, d_model=d_model, n_heads=n_heads, num_layers=num_layers)
model.load_state_dict(torch.load("./stock_prediction_model.pth"))  # 파라미터 로드
model.eval()
print("✅ 모델 로딩 완료.")

# 4. 예측 함수 정의
def sliding_predict(model, input_sequence):
    """
    model: 학습된 딥러닝 모델
    input_sequence: 길이 30의 numpy array (원래의 close_1 ~ close_30, 이미 scaled된 상태)
    """
    predictions_scaled = []

    # 30일 예측
    for _ in range(30):
        # 슬라이딩 윈도우를 사용하여 28일 데이터로 변환
        # 예를 들어, 마지막 28일을 사용하여 예측
        X = torch.tensor(input_sequence[:, :patch_size * n_patches, :], dtype=torch.float32)  # X는 (samples, patch_size * n_patches, features) 형태
        next_scaled = model(X).detach().numpy()  # 모델 예측 후 detach()로 그래디언트 계산에서 제외한 후 .numpy() 호출
        predictions_scaled.append(next_scaled)

        # 슬라이딩 윈도우: 새 예측 결과 추가
        # input_sequence에서 첫 2일을 제외하고 예측값을 추가하여 최신 30일 데이터 유지
        # next_scaled를 3차원 배열로 변환 (samples, 1, 1) 형태로 변경하여 추가
        next_scaled_3d = next_scaled.reshape(-1, 1, 1)  # (samples, 1, 1)
        input_sequence = np.append(input_sequence[:, 1:, :], next_scaled_3d, axis=1)

    return predictions_scaled


# 5. 예측 결과를 DB에 저장하는 함수
input_sequence = scaled_data  # 각 종목의 30일 종가 데이터를 사용
predictions_scaled = sliding_predict(model, input_sequence)  # 예측 수행
print(np.array(predictions_scaled).shape)

def save_predictions_to_db(stock_ids, predictions_scaled, min_val, max_val):
    insert_sql = """
    INSERT INTO stock_prediction_result (stock_id, predict_day, predicted_scaled, predicted_close)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (stock_id, predict_day) DO NOTHING;
    """
    # predictions_scaled가 list라면 numpy 배열로 변환
    predictions_scaled = np.array(predictions_scaled, dtype=np.float32)

    # predictions_scaled는 (30, 992) 형태 => 30일 예측, 992개 주식
    for i, stock_id in enumerate(stock_ids):  # 각 stock_id에 대해 예측값 저장
        for predict_day in range(30):
            predicted_scaled = float(predictions_scaled[predict_day, i])
            predicted_close = predicted_scaled * (max_val - min_val) + min_val
            cur.execute(insert_sql, (stock_id, predict_day + 1, predicted_scaled, predicted_close))

cur.execute("SELECT close_min, close_max FROM stock_scaler_info LIMIT 1;")
min_val, max_val = cur.fetchone()
save_predictions_to_db(stock_ids, predictions_scaled, min_val, max_val)  # 예측 결과 DB에 저장


# 트랜잭션 커밋 및 DB 연결 종료
conn.commit()
cur.close()
conn.close()

print("✅ 모든 예측 결과가 DB에 저장되었습니다.")
