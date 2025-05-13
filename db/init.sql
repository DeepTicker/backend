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
CREATE TABLE stock_catchphrases (
    stock_id INT PRIMARY KEY,
    phrase TEXT
);


------------------NEWS-----------------------
-- ENUM 타입 정의
CREATE TYPE news_category AS ENUM ('개별주', '산업군', '테마', '전반적', '그 외');
CREATE TYPE summary_level AS ENUM ('초급', '중급', '고급');
-- 1. 주식 정보
CREATE TABLE tmp_stock (
    stock_code VARCHAR(6) PRIMARY KEY,
    stock_name TEXT NOT NULL,
    themes JSONB DEFAULT '[]',
    industry_group TEXT,
    description TEXT
);

-- 2. 뉴스 원문
CREATE TABLE news_raw (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    press VARCHAR(100),
    reporter VARCHAR(100),
    image_url TEXT,
    image_desc TEXT,
    url TEXT,
    date TIMESTAMP,
    crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 뉴스 분류
CREATE TABLE news_classification (
    news_id INTEGER REFERENCES news_raw(id) ON DELETE CASCADE,
    category news_category,        -- ENUM: '산업군', '테마', '전반적', '개별주' , '그 외'
    representative TEXT,          -- 개별주: 종목명들, 산업군/테마: 하나의 명칭, 전반적: 요약문
    classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (news_id, category)
);

-- 4. 뉴스 요약
CREATE TABLE news_summary (
    news_id INTEGER REFERENCES news_raw(id) ON DELETE CASCADE,
    level summary_level NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    rouge1 REAL,
    rougeL REAL,
    bleu REAL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (news_id, level)
);

-- 4.5. 뉴스 참고 요약
CREATE TABLE news_reference_summary (
    news_id INTEGER REFERENCES news_raw(id) ON DELETE CASCADE,
    level summary_level NOT NULL,
    reference TEXT NOT NULL,
    PRIMARY KEY (news_id, level)
);

-- 5. 산업군 정보
CREATE TABLE industry_info (
    industry_name TEXT PRIMARY KEY,
    description TEXT,
    top_stocks TEXT[]  -- 종목코드 리스트
);
-- 5.5. 산업군 주요 이슈 요약
CREATE TABLE industry_issue (
    id SERIAL PRIMARY KEY,
    industry_name TEXT NOT NULL REFERENCES industry_info(industry_name) ON DELETE CASCADE,
    summary_date DATE NOT NULL, -- 요약 기준 날찌 : 이 날짜를 기준으로 최근 20일
    summary_title TEXT[],     -- 이슈 제목 리스트 (구조화 요약)
    summary_detail TEXT[],    -- 이슈 설명 리스트 (summary_title과 1:1 대응)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- DB row가 언제 생성되었는지지

    CONSTRAINT unique_industry_summary UNIQUE (industry_name, summary_date)
);

-- 6. 테마 정보
CREATE TABLE theme_info (
    theme_name TEXT PRIMARY KEY,
    definition TEXT,
    beneficiaries TEXT[]  -- 종목코드 리스트
);

CREATE TABLE theme_issue (
    id SERIAL PRIMARY KEY,
    theme_name TEXT NOT NULL REFERENCES theme_info(theme_name) ON DELETE CASCADE,
    summary_date DATE NOT NULL, -- 요약 기준 날찌 : 이 날짜를 기준으로 최근 20일
    summary_title TEXT[],     -- 이슈 제목 리스트 (구조화 요약)
    summary_detail TEXT[],    -- 이슈 설명 리스트 (summary_title과 1:1 대응)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- DB row가 언제 생성되었는지지

    CONSTRAINT unique_theme_summary UNIQUE (theme_name, summary_date)
);

-- 7. 산업 민감도
CREATE TABLE macro_sensitivity (
    macro_variable TEXT PRIMARY KEY,
    positive_industries TEXT[],
    negative_industries TEXT[]
);

---8. 경제 용어 해설
CREATE TABLE financial_terms (
  term TEXT PRIMARY KEY,
  explanation TEXT, -- 중학생 수준 요약
  original_explanation TEXT, -- 원문 해설
  category TEXT CHECK (
    category IN ('경제용어', '정책', '시장 용어', '기업 재무', '산업/기술', '기타')
  ),
  source TEXT DEFAULT 'BOK or Gemini',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO financial_terms (term, explanation, original_explanation, category)
VALUES
-- 경제용어
('GDP', '나라 전체가 벌어들인 돈의 총합이에요.', '국내총생산(GDP, Gross Domestic Product)은 한 나라 안에서 일정 기간 동안 생산된 재화와 서비스의 총액을 의미합니다.', '경제용어'),
('인플레이션', '물건값이 전반적으로 오르는 현상이에요.', '인플레이션(Inflation)은 재화와 서비스의 전반적인 가격이 지속적으로 상승하는 현상을 의미합니다.', '경제용어'),
('디플레이션', '물건값이 계속 내려가는 현상이에요.', '디플레이션(Deflation)은 전반적인 물가 수준이 지속적으로 하락하는 경제 현상을 말합니다.', '경제용어'),
('실업률', '일하고 싶지만 일자리를 못 구한 사람의 비율이에요.', '실업률은 경제활동인구 중에서 실업자가 차지하는 비율을 말합니다.', '경제용어'),
('금리', '돈을 빌릴 때 내야 하는 이자의 비율이에요.', '금리란 돈을 빌려준 대가로 받는 이자의 비율을 의미합니다.', '경제용어'),

-- 시장 용어
('주식', '회사에 돈을 투자하면 받는 작은 소유권이에요.', '주식은 기업의 소유권을 나타내는 증서로, 주주에게는 배당과 의결권 등의 권리가 주어집니다.', '시장 용어'),
('채권', '정부나 기업에 돈을 빌려주고 받는 약속이에요.', '채권은 정부나 기업이 자금을 조달하기 위해 발행하는 차용증서로, 일정 기간 후에 원금과 이자를 돌려주는 증권입니다.', '시장 용어'),
('지수', '주식시장 전체의 흐름을 나타내는 숫자에요.', '지수(Index)는 주식 시장 전체나 특정 분야의 주가 흐름을 나타내는 대표적인 수치입니다.', '시장 용어'),
('매수', '주식을 사는 거예요.', '매수는 금융시장에서 주식이나 자산을 구매하는 행위를 말합니다.', '시장 용어'),
('매도', '주식을 파는 거예요.', '매도는 금융시장에서 주식이나 자산을 파는 행위를 의미합니다.', '시장 용어');

-- 전반적 이슈 테이블
CREATE TABLE macro_issue (
    id SERIAL PRIMARY KEY,
    summary_date DATE NOT NULL,
    representative VARCHAR(50),  -- representative
    summary_title TEXT[],     -- 이슈 제목 리스트
    summary_detail TEXT[],    -- 이슈 설명 리스트
    related_indicators TEXT[], -- 관련 지표 리스트
    market_impact TEXT[],     -- 시장 영향 리스트
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(summary_date, representative)  -- 날짜와 representative 조합으로 unique 제약
);

-- 개별주식 이슈 테이블
CREATE TABLE stock_issue (
    id SERIAL PRIMARY KEY,
    stock_code VARCHAR(20) NOT NULL,    -- 주식 코드
    stock_name VARCHAR(50) NOT NULL,    -- 주식 이름
    summary_date DATE NOT NULL,         -- 요약 날짜
    summary_title TEXT[],               -- 이슈 제목 리스트
    summary_detail TEXT[],              -- 이슈 설명 리스트
    related_indicators TEXT[],          -- 관련 지표 리스트
    price_impact TEXT[],                -- 주가 영향 리스트
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_code, summary_date)    -- 주식 코드와 날짜 조합으로 unique 제약
);