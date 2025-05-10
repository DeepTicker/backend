-- 1. stock_data: 주가 예측의 input data
CREATE TABLE stock_data (
    stock_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    code VARCHAR(6) NOT NULL,
    name VARCHAR(100), 
    market_cap BIGINT,
    open DECIMAL(10, 2),
    high DECIMAL(10, 2),
    low DECIMAL(10, 2),
    close DECIMAL(10, 2),
    volume INTEGER, 
    change DECIMAL(5,2)
    -- cpi DECIMAL(10, 2),
    -- interest_rate DECIMAL(5, 2),
    -- exchange_rate DECIMAL(10, 2),
    -- eps DECIMAL(10, 2),
    -- roe DECIMAL(5, 2)
);

-- 2. stock_prediction: 예측 output 데이터
CREATE TABLE stock_close_sequence (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stock_data(stock_id),
    close_1 DECIMAL(10,2),
    close_2 DECIMAL(10,2),
    close_3 DECIMAL(10,2),
    close_4 DECIMAL(10,2),
    close_5 DECIMAL(10,2),
    close_6 DECIMAL(10,2),
    close_7 DECIMAL(10,2),
    close_8 DECIMAL(10,2),
    close_9 DECIMAL(10,2),
    close_10 DECIMAL(10,2),
    close_11 DECIMAL(10,2),
    close_12 DECIMAL(10,2),
    close_13 DECIMAL(10,2),
    close_14 DECIMAL(10,2),
    close_15 DECIMAL(10,2),
    close_16 DECIMAL(10,2),
    close_17 DECIMAL(10,2), 
    close_18 DECIMAL(10,2),
    close_19 DECIMAL(10,2),
    close_20 DECIMAL(10,2),
    close_21 DECIMAL(10,2),
    close_22 DECIMAL(10,2),
    close_23 DECIMAL(10,2),
    close_24 DECIMAL(10,2),
    close_25 DECIMAL(10,2),
    close_26 DECIMAL(10,2),
    close_27 DECIMAL(10,2),
    close_28 DECIMAL(10,2),
    close_29 DECIMAL(10,2),
    close_30 DECIMAL(10,2)
);

CREATE TABLE stock_close_sequence_scaled (
    stock_id INTEGER PRIMARY KEY REFERENCES stock_data(stock_id),
    close_1 FLOAT, close_2 FLOAT, close_3 FLOAT, close_4 FLOAT, close_5 FLOAT,
    close_6 FLOAT, close_7 FLOAT, close_8 FLOAT, close_9 FLOAT, close_10 FLOAT,
    close_11 FLOAT, close_12 FLOAT, close_13 FLOAT, close_14 FLOAT, close_15 FLOAT,
    close_16 FLOAT, close_17 FLOAT, close_18 FLOAT, close_19 FLOAT, close_20 FLOAT,
    close_21 FLOAT, close_22 FLOAT, close_23 FLOAT, close_24 FLOAT, close_25 FLOAT,
    close_26 FLOAT, close_27 FLOAT, close_28 FLOAT, close_29 FLOAT, close_30 FLOAT
);

CREATE TABLE stock_scaler_info (
    close_min DOUBLE PRECISION NOT NULL,  -- 종가의 최소값
    close_max DOUBLE PRECISION NOT NULL   -- 종가의 최대값
);

-- CREATE TABLE stock_prediction (
--     prediction_id SERIAL PRIMARY KEY,
--     stock_id INTEGER REFERENCES stock_data(stock_id),
--     predicted_date DATE NOT NULL,
--     predicted_close DECIMAL(10, 2),
--     confidence_score DECIMAL(5, 2),
--     var DECIMAL(10, 2),
--     conditional_var DECIMAL(10, 2)
-- );
CREATE TABLE stock_prediction_result (
    stock_id INT NOT NULL,
    predict_day INT NOT NULL,  -- 예측일: 1~30
    predicted_scaled FLOAT NOT NULL,  -- 예측된 스케일된 값
    predicted_close FLOAT NOT NULL,  -- 역변환된 원래 종가 값
    PRIMARY KEY (stock_id, predict_day)
);


-- 3. stock_recommendation: 유사 종목 추천
CREATE TABLE stock_recommendation (
    recommendation_id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stock_data(stock_id),
    similar_stock_id_1 INTEGER REFERENCES stock_data(stock_id),
    similar_stock_id_2 INTEGER REFERENCES stock_data(stock_id),
    similar_stock_id_3 INTEGER REFERENCES stock_data(stock_id),
    marcap FLOAT,  
    cluster_index INTEGER,  
    cluster_name TEXT,  
    recommended_date DATE NOT NULL
);

-- 4. stock_news: 뉴스 데이터
CREATE TABLE stock_news (
    news_id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stock_data(stock_id),
    news_date DATE NOT NULL,
    news_content TEXT,
    event_type VARCHAR(50),
    entity_recognized TEXT
);

-- 5. stock_factor_analysis: 상승/하락 요인 분석
CREATE TABLE stock_factor_analysis (
    analysis_id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stock_data(stock_id),
    inc_factor_description TEXT,
    dec_factor_description TEXT,
    confidence_score DECIMAL(5, 2),
    analysis_date DATE NOT NULL
);


------------------NEWS-----------------------
-- ENUM 타입 정의
CREATE TYPE news_category AS ENUM ('개별주', '산업군', '테마', '전반적', '그 외');
CREATE TYPE summary_level AS ENUM ('초급', '중급', '고급');
CREATE TYPE market_type_enum AS ENUM ('KOSPI', 'KOSDAQ');

-- 1. 주식 정보
CREATE TABLE tmp_stock (
    stock_code VARCHAR(6) PRIMARY KEY,
    stock_name TEXT NOT NULL,
    themes JSONB DEFAULT '[]',
    industry_group TEXT,
    market_type market_type_enum,
    description TEXT
);

-- 2. 뉴스 원문
CREATE TABLE news_raw (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    press VARCHAR(100),
    reporter VARCHAR(100),
    url TEXT,
    date TIMESTAMP,
    crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 뉴스 분류
CREATE TABLE news_classification (
    news_id INTEGER REFERENCES news_raw(id) ON DELETE CASCADE,
    category news_category,
    representative TEXT,
    classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (news_id)
);

-- 4. 뉴스 요약
CREATE TABLE news_summary (
    news_id INTEGER REFERENCES news_raw(id) ON DELETE CASCADE,
    level summary_level,
    headline TEXT,
    summary TEXT,
    background_knowledge TEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (news_id, level)
);

-- 5. 산업군 정보
CREATE TABLE industry_info (
    industry_name TEXT PRIMARY KEY,
    description TEXT,
    top_stocks TEXT[]  -- 종목코드 리스트
);

-- 6. 테마 정보
CREATE TABLE theme_info (
    theme_name TEXT PRIMARY KEY,
    definition TEXT,
    beneficiaries TEXT[]  -- 종목코드 리스트
);

-- 7. 산업 민감도
CREATE TABLE macro_sensitivity (
    macro_variable TEXT PRIMARY KEY,
    positive_industries TEXT[],
    negative_industries TEXT[]
);