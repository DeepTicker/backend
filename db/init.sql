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
CREATE TABLE news_terms (
  news_id INTEGER REFERENCES news_raw(id),
  term TEXT,
  category TEXT,
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (news_id, term)
);
-- 4.6. 뉴스 용어 추출 : 각 뉴스별로 어떤 용어가 있는지 (이미 NER한 경우)
CREATE TABLE news_terms (
  news_id INTEGER REFERENCES news_raw(id),
  term TEXT,
  PRIMARY KEY (news_id, term)
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
('경기순환', '경제 활동이 호황과 불황을 반복하는 현상', '국가 경제가 확장(호황)과 수축(불황) 단계를 주기적으로 반복하는 경제 활동의 변동 패턴', '경제용어'),
('경상수지', '한 나라가 외국과 주고받은 돈의 차이', '한 국가가 일정 기간 동안 다른 국가와의 경제 거래에서 발생한 상품, 서비스, 소득, 이전 등의 수입과 지출 차이', '경제용어'),
('환율', '한 나라 돈을 다른 나라 돈으로 바꾸는 비율', '서로 다른 국가의 통화 간 교환 비율로, 국제 금융시장에서 형성되는 통화 가치의 상대적 척도', '경제용어'),
('기준금리', '중앙은행이 정하는 기본 금리', '중앙은행이 시중은행에 자금을 공급할 때 적용하는 정책금리로, 다른 모든 금리의 기준이 되는 지표', '경제용어'),
('소비자물가지수', '일반 소비자가 구매하는 상품과 서비스 가격의 변동을 측정하는 지표', '가계가 구입하는 상품과 서비스의 가격 변동을 종합적으로 측정하여 산출한 지수로, 인플레이션 측정에 주로 사용', '경제용어'),

-- 시장 용어
('유동성', '자산을 빠르게 현금으로 바꿀 수 있는 정도', '자산이 손실 없이 신속하게 현금으로 전환될 수 있는 능력이나 시장에서 거래가 활발하게 이루어지는 정도', '시장 용어'),
('변동성', '가격이 오르내리는 정도', '금융 상품의 가격이나 시장 지수가 특정 기간 동안 변화하는 정도를 나타내는 지표', '시장 용어'),
('배당', '기업이 주주에게 이익을 나누어 주는 것', '기업이 벌어들인 이익의 일부를 주주들에게 현금이나 주식 형태로 분배하는 것', '시장 용어'),
('공매도', '빌린 주식을 팔고 나중에 다시 사서 갚는 투자 방법', '투자자가 보유하지 않은 증권을 빌려서 매도한 후, 가격이 하락했을 때 매수하여 차익을 얻는 투자 전략', '시장 용어'),
('시가총액', '회사의 모든 주식 가치를 합한 금액', '기업이 발행한 총 주식 수에 현재 주가를 곱한 값으로, 기업의 시장 가치를 나타내는 지표', '시장 용어'),

-- 기업 재무
('PER', '주가를 1주당 순이익으로 나눈 값', '주가수익비율(Price Earnings Ratio)로, 현재 주가가 기업의 1주당 순이익의 몇 배인지 나타내는 투자 지표', '기업 재무'),
('PBR', '주가를 1주당 순자산으로 나눈 값', '주가순자산비율(Price Book-value Ratio)로, 기업의 시장 가치와 장부상 가치의 비율을 나타내는 투자 지표', '기업 재무'),
('ROE', '기업이 자기자본으로 얼마나 이익을 냈는지 보여주는 비율', '자기자본수익률(Return On Equity)로, 기업이 주주 자본을 활용하여 얼마나 효율적으로 이익을 창출했는지 측정하는 지표', '기업 재무'),
('EPS', '1주당 기업이 벌어들인 순이익', '주당순이익(Earnings Per Share)으로, 기업의 순이익을 발행 주식 수로 나눈 값', '기업 재무'),
('부채비율', '기업의 자기자본 대비 부채의 비율', '기업의 총 부채를 자기자본으로 나눈 백분율로, 재무 안정성을 평가하는 핵심 지표', '기업 재무'),

-- 정책
('통화정책', '중앙은행이 돈의 양과 금리를 조절하는 정책', '중앙은행이 물가 안정과 경제 성장을 위해 통화량과 금리를 조절하는 경제 정책', '정책'),
('재정정책', '정부가 세금과 지출을 조절하는 정책', '정부가 조세 수입과 재정 지출을 통해 국가 경제 활동에 영향을 미치는 정책', '정책'),
('양적완화', '중앙은행이 시장에 돈을 대량 공급하는 정책', '중앙은행이 국채나 기타 금융자산을 대규모로 매입하여 시중에 유동성을 공급하는 비전통적 통화정책', '정책'),
('기준금리 인상', '중앙은행이 기준금리를 올리는 것', '중앙은행이 경기과열이나 인플레이션 억제를 위해 기준금리를 상향 조정하는 통화정책 결정', '정책'),
('기준금리 인하', '중앙은행이 기준금리를 내리는 것', '중앙은행이 경기 부양이나 경제 활성화를 위해 기준금리를 하향 조정하는 통화정책 결정', '정책'),

-- 산업/기술
('블록체인', '정보를 분산 저장하는 디지털 장부 기술', '거래 정보를 중앙 서버 없이 네트워크 참여자들이 분산하여 저장하고 관리하는 분산 원장 기술', '산업/기술'),
('핀테크', '금융과 기술을 결합한 새로운 금융 서비스', '금융(Finance)과 기술(Technology)의 합성어로, 디지털 기술을 활용하여 혁신적인 금융 서비스를 제공하는 산업', '산업/기술'),
('ESG', '환경, 사회, 지배구조를 고려한 기업 경영 방식', '환경(Environment), 사회(Social), 지배구조(Governance)의 약자로, 기업의 지속가능성과 사회적 영향을 평가하는 비재무적 요소', '산업/기술'),
('메타버스', '가상과 현실이 융합된 디지털 공간', '현실 세계와 가상 세계가 융합된 3차원 가상 공간으로, 사용자들이 아바타를 통해 다양한 경제·사회·문화 활동을 할 수 있는 플랫폼', '산업/기술'),
('디지털 화폐', '전자적 형태로 존재하는 화폐', '실물 화폐 없이 전자적 형태로만 존재하는 화폐로, 중앙은행 디지털 화폐(CBDC)와 암호화폐 등이 포함', '산업/기술'),

-- 기타
('베어마켓', '주가가 장기간 하락하는 시장', '주식 시장에서 주가가 지속적으로 하락하는 추세를 보이는 시장 상황으로, 일반적으로 20% 이상 하락 시 정의', '기타'),
('불마켓', '주가가 장기간 상승하는 시장', '주식 시장에서 주가가 지속적으로 상승하는 추세를 보이는 시장 상황으로, 낙관적 투자 심리가 지배적인 시기', '기타'),
('모멘텀', '가격이 움직이는 추세의 강도', '증권 가격 변화의 속도나 방향성을 나타내는 지표로, 현재의 가격 움직임이 지속될 가능성을 분석하는 데 사용', '기타'),
('헤지', '위험을 줄이기 위해 반대 포지션을 취하는 전략', '투자 위험을 감소시키기 위해 기존 포지션과 반대되는 포지션을 취함으로써 손실 가능성을 최소화하는 투자 전략', '기타'),
('레버리지', '빌린 돈으로 투자 규모를 키우는 것', '자기자본 외에 타인자본을 활용하여 투자 규모를 확대함으로써 수익률을 높이거나 손실을 확대할 수 있는 투자 기법', '기타');

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