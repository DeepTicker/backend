CREATE TABLE stock_info (
    code VARCHAR(6) PRIMARY KEY,  -- 종목 코드로 기본키 사용
    name VARCHAR(100) NOT NULL,
    market_cap BIGINT             -- 시가총액 (필요 시 히스토리 테이블로 분리 가능)
);

CREATE TABLE stock_data (
    code VARCHAR(6) NOT NULL REFERENCES stock_info(code),
    date DATE NOT NULL,
    open DECIMAL(10, 2),
    high DECIMAL(10, 2),
    low DECIMAL(10, 2),
    close DECIMAL(10, 2),
    volume INTEGER,
    change DECIMAL(5, 2),
    PRIMARY KEY (code, date)
);
CREATE TABLE stock_close_sequence (
    code VARCHAR(6) NOT NULL REFERENCES stock_info(code),
    date DATE NOT NULL,  -- 기준 날짜
    day_ahead INT NOT NULL CHECK (day_ahead BETWEEN 1 AND 30),
    close_price DECIMAL(10,2),
    PRIMARY KEY (code, date, day_ahead)
);

CREATE TABLE stock_scaler_info (
    code VARCHAR(6) PRIMARY KEY REFERENCES stock_info(code),
    close_min DOUBLE PRECISION NOT NULL,
    close_max DOUBLE PRECISION NOT NULL
);
CREATE TABLE stock_prediction_result (
    code VARCHAR(6) NOT NULL REFERENCES stock_info(code),
    date DATE NOT NULL,  -- 예측 기준 날짜
    predict_day INT NOT NULL CHECK (predict_day BETWEEN 1 AND 30),
    predicted_scaled FLOAT NOT NULL,
    predicted_close FLOAT NOT NULL,
    PRIMARY KEY (code, date, predict_day)
);
CREATE TABLE stock_recommendation (
    recommendation_id SERIAL PRIMARY KEY,
    code VARCHAR(6) NOT NULL REFERENCES stock_info(code),
    similar_code_1 VARCHAR(6) REFERENCES stock_info(code),
    similar_code_2 VARCHAR(6) REFERENCES stock_info(code),
    similar_code_3 VARCHAR(6) REFERENCES stock_info(code),
    marcap FLOAT,
    cluster_index INTEGER,
    cluster_name TEXT,
    recommended_date DATE NOT NULL
);
CREATE TABLE stock_catchphrases (
    code VARCHAR(6) PRIMARY KEY REFERENCES stock_info(code),
    phrase TEXT
);
