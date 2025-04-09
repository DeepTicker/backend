-- 1. stock_data: 주가 예측의 input data
CREATE TABLE stock_data (
    stock_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    name VARCHAR(100), 
    open DECIMAL(10, 2),
    high DECIMAL(10, 2),
    low DECIMAL(10, 2),
    close DECIMAL(10, 2),
    volume INTEGER,
    market_cap BIGINT, 
    change_rate DECIMAL(5,2), 
    cpi DECIMAL(10, 2),
    interest_rate DECIMAL(5, 2),
    exchange_rate DECIMAL(10, 2),
    eps DECIMAL(10, 2),
    roe DECIMAL(5, 2)
);

-- 2. stock_prediction: 예측 output 데이터
CREATE TABLE stock_prediction (
    prediction_id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stock_data(stock_id),
    predicted_date DATE NOT NULL,
    predicted_close DECIMAL(10, 2),
    confidence_score DECIMAL(5, 2),
    var DECIMAL(10, 2),
    conditional_var DECIMAL(10, 2)
);

-- 3. stock_recommendation: 유사 종목 추천
CREATE TABLE stock_recommendation (
    recommendation_id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES stock_data(stock_id),
    similar_stock_id INTEGER REFERENCES stock_data(stock_id),
    similarity_score DECIMAL(5, 2),
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
