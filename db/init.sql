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

INSERT INTO industry_info(industry_name, description, top_stocks) VALUES
('상업서비스', '프랜차이즈, 렌탈, 배송 등 다양한 상업 서비스 제공 산업', ARRAY['051500','089860','068400','030000','045660']),
('기타금융', '캐피탈, 리스, 대부업 등 은행·증권·보험 외 금융 서비스 분야', ARRAY['079370','089850','088260','088800','138930']),
('유통', '소매·편의점·백화점·온라인 쇼핑 등 제품 유통 채널 운영 산업', ARRAY['139480','023530','004170','007070','282330']),
('내구소비재및의류', '가전·의류·스포츠용품 등 장기간 사용 및 의류 제조 산업', ARRAY['066570','005930','020000','007700','111770']),
('미디어', '방송·콘텐츠·OTT·영상제작 등 미디어 및 엔터테인먼트 산업', ARRAY['035760','079160','067160','035720','035420']),
('운송', '물류·택배·항공·해운 등 화물·여객 운송 서비스 산업', ARRAY['000120','086280','011200','002320','003490']),
('음식료및담배', '식품·음료·담배 제품 제조 및 유통 산업', ARRAY['004370','007310','005300','000080','033780']),
('건축소재', '시멘트·철근·타일·단열재 등 건축용 소재 생산 산업', ARRAY['002380','000390','183190','004980','198440']),
('소프트웨어', 'ERP·클라우드·보안·플랫폼·인공지능 등 소프트웨어 개발·서비스 산업', ARRAY['012510','053800','030520','018260','131370']),
('증권', '증권중개·리서치·투자자문 등 증권거래 및 금융서비스 산업', ARRAY['006800','005940','016360','039490','008560']),
('보험', '생명보험·손해보험 등 보장성 보험 상품 제공 산업', ARRAY['032830','088350','000810','001450','005830']),
('하드웨어', '서버·스토리지·네트워크장비 등 컴퓨터 관련 하드웨어 제조 산업', ARRAY['005930','066570','039030','008060','056190']),
('소재', '화학소재·신소재·기초소재 등 다양한 산업용 소재 개발·생산 산업', ARRAY['051910','011170','010060','011780','120110']),
('자본재', '산업기계·공장설비 등 자본재 장비 제조 산업', ARRAY['034020','267250','204320','042670','011210']),
('금속및광물', '철강·비철금속·광물 채굴 및 정련 산업', ARRAY['005490','004020','010130','001230','008350']),
('부동산', '주택·상업용 부동산 개발·분양·임대 산업', ARRAY['028260','000720','006360','047040','294870']),
('제약및바이오', '의약품·바이오의약품·임상시험 등 제약 및 바이오 산업', ARRAY['207940','068270','128940','000100','006280']),
('통신서비스', '유무선 통신·5G 네트워크·데이터통신 서비스 산업', ARRAY['017670','030200','032640','109070','037560']),
('유틸리티', '전력·가스·수도 등 공공 서비스 및 에너지 공급 산업', ARRAY['015760','003460','017390','117580','017940']),
('종이및목재', '펄프·목재·제지 등 종이 및 목재 제품 제조 산업', ARRAY['213500','009580','017000','002310','025870']),
('은행', '예금·대출·수신·지급결제 등 은행 금융 서비스 산업', ARRAY['105560','055550','086790','316140','034830']),
('의료장비및서비스', '의료기기·진단장비·의료서비스 제공 산업', ARRAY['096530','086900','048260','082370','043150']),
('에너지', '석유·가스·재생에너지 등 에너지 생산·공급 산업', ARRAY['015760','003460','096770','010950','336260']),
('자동차및부품', '완성차·자동차 부품 제조 및 모빌리티 산업', ARRAY['005380','000270','012330','000240','204320']),
('소비자서비스', '호텔·여행·레저·교육 등 소비자 대상 서비스 산업', ARRAY['008770','079160','039130','032350','079780']),
('생활용품', '가정용·위생·주방·퍼스널케어 등 생활용품 제조 산업', ARRAY['051900','090430','018250','161890','021240']),
('반도체', '메모리·파운드리·반도체 장비 등 반도체 제조 산업', ARRAY['005930','000660','000990','166090','036830']),
('디스플레이', 'LCD·OLED·TFT 패널 및 디스플레이 장비 산업', ARRAY['034220','272290','029780','039030','051370']);


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

INSERT INTO industry_issue (industry_name, summary_date, summary_title, summary_detail, updated_at) VALUES
('상업서비스', '2025-05-05', ARRAY['상업서비스 title1'], ARRAY['상업서비스 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('기타금융', '2025-05-05', ARRAY['기타금융 title1'], ARRAY['기타금융 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('유통', '2025-05-05', ARRAY['유통 title1'], ARRAY['유통 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('내구소비재및의류', '2025-05-05', ARRAY['내구소비재및의류 title1'], ARRAY['내구소비재및의류 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('미디어', '2025-05-05', ARRAY['미디어 title1'], ARRAY['미디어 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('운송', '2025-05-05', ARRAY['운송 title1'], ARRAY['운송 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('음식료및담배', '2025-05-05', ARRAY['음식료및담배 title1'], ARRAY['음식료및담배 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('건축소재', '2025-05-05', ARRAY['건축소재 title1'], ARRAY['건축소재 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('소프트웨어', '2025-05-05', ARRAY['소프트웨어 title1'], ARRAY['소프트웨어 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('증권', '2025-05-05', ARRAY['증권 title1'], ARRAY['증권 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('보험', '2025-05-05', ARRAY['보험 title1'], ARRAY['보험 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('하드웨어', '2025-05-05', ARRAY['하드웨어 title1'], ARRAY['하드웨어 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('소재', '2025-05-05', ARRAY['소재 title1'], ARRAY['소재 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('자본재', '2025-05-05', ARRAY['자본재 title1'], ARRAY['자본재 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('금속및광물', '2025-05-05', ARRAY['금속및광물 title1'], ARRAY['금속및광물 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('부동산', '2025-05-05', ARRAY['부동산 title1'], ARRAY['부동산 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('제약및바이오', '2025-05-05', ARRAY['제약및바이오 title1'], ARRAY['제약및바이오 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('통신서비스', '2025-05-05', ARRAY['통신서비스 title1'], ARRAY['통신서비스 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('유틸리티', '2025-05-05', ARRAY['유틸리티 title1'], ARRAY['유틸리티 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('종이및목재', '2025-05-05', ARRAY['종이및목재 title1'], ARRAY['종이및목재 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('은행', '2025-05-05', ARRAY['은행 title1'], ARRAY['은행 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('의료장비및서비스', '2025-05-05', ARRAY['의료장비및서비스 title1'], ARRAY['의료장비및서비스 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('에너지', '2025-05-05', ARRAY['에너지 title1'], ARRAY['에너지 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('자동차및부품', '2025-05-05', ARRAY['자동차및부품 title1'], ARRAY['자동차및부품 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('소비자서비스', '2025-05-05', ARRAY['소비자서비스 title1'], ARRAY['소비자서비스 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('생활용품', '2025-05-05', ARRAY['생활용품 title1'], ARRAY['생활용품 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('반도체', '2025-05-05', ARRAY['반도체 title1'], ARRAY['반도체 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('디스플레이', '2025-05-05', ARRAY['디스플레이 title1'], ARRAY['디스플레이 아직 요약이 생성되지 않았습니다'], '2025-05-05');


-- 6. 테마 정보
CREATE TABLE theme_info (
    theme_name TEXT PRIMARY KEY,
    definition TEXT,
    beneficiaries TEXT[]  -- 종목코드 리스트
);

INSERT INTO theme_info(theme_name, definition, beneficiaries) VALUES
('2차전지', '리튬이온 등 2차전지 생산 및 관련 소재 산업', ARRAY['006400','373220','096770','066970','003670']),
('전기차', '전기 구동차량 생산 및 충전 인프라 산업', ARRAY['005380','000270','012330','204320','247540']),
('AI 챗봇(챗GPT 등)', '대화형 AI 챗봇 및 생성형 AI 플랫폼 산업', ARRAY['035720','035420','018260','017670','038060']),
('지능형로봇/인공지능(AI)', '자율 및 산업용 로봇 개발 및 인공지능 로봇 산업', ARRAY['090710','056080','090360','272210','011210']),
('폐배터리', '사용 후 배터리 재활용 및 자원순환 산업', ARRAY['003670','096770','086520','051910','066970']),
('클라우드 컴퓨팅', '퍼블릭·프라이빗 클라우드 서비스 및 인프라 산업', ARRAY['012510','042000','181710','018260','035420']),
('시스템반도체', '메모리 제외 반도체 설계·팹리스·패키징 산업', ARRAY['005930','000660','000990','108320','036490']),
('HBM(고대역폭메모리)', '고대역폭 메모리 기술 및 제품 산업', ARRAY['005930','000660','000990','108320','042700']),
('자율주행차', '자율주행 기술 및 센서·ADAS 시스템 산업', ARRAY['005380','000270','012330','204320','017670']),
('풍력에너지', '풍력 발전 및 관련 장비 산업', ARRAY['112610','000880','010140','015760','028050']),
('태양광에너지', '태양광 발전 및 모듈·소재 산업', ARRAY['009830','010060','011930','066570','000880']),
('온실가스(탄소배출권)/탄소 포집·활용·저장(CCUS)', '탄소 배출권·탄소포집·저장(CCUS) 등 기후환경 대응 산업', ARRAY['005490','018670','015760','009830','051910']),
('마이크로바이옴', '장내 미생물 기반 헬스케어·진단 산업', ARRAY['085660','096530','064550','084650','031390']),
('면역항암제', '면역세포치료 및 항암 면역치료제 개발 산업', ARRAY['207940','068270','006280','095700','208340']),
('유전자 치료제/분석', '유전자 편집·치료제 및 유전체 분석 산업', ARRAY['199800','314130','031390','096530','245310']),
('mRNA(메신저 리보핵산)', 'mRNA 백신 및 치료 플랫폼 개발 산업', ARRAY['053030','095700','207940','299660','147760']),
('STO(토큰증권 발행)', '토큰증권 발행 및 디지털 자산 증권화 산업', ARRAY['016360','005940','003540','006800','071050']),
('카카오뱅크(kakao BANK)', '인터넷 전문은행 및 디지털 금융 서비스 산업', ARRAY['323410','035720','030200','055550','086790']),
('UAM(도심항공모빌리티)', '도심항공모빌리티 및 에어택시 산업', ARRAY['005380','012450','047810','079550','010140']),
('메타버스(Metaverse)', '가상현실·증강현실 기반 메타버스 플랫폼 산업', ARRAY['035720','035420','036570','251270','192080']);


CREATE TABLE theme_issue (
    id SERIAL PRIMARY KEY,
    theme_name TEXT NOT NULL REFERENCES theme_info(theme_name) ON DELETE CASCADE,
    summary_date DATE NOT NULL, -- 요약 기준 날찌 : 이 날짜를 기준으로 최근 20일
    summary_title TEXT[],     -- 이슈 제목 리스트 (구조화 요약)
    summary_detail TEXT[],    -- 이슈 설명 리스트 (summary_title과 1:1 대응)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- DB row가 언제 생성되었는지지

    CONSTRAINT unique_theme_summary UNIQUE (theme_name, summary_date)
);

INSERT INTO theme_issue (theme_name, summary_date, summary_title, summary_detail, updated_at) VALUES
('2차전지', '2025-05-05', ARRAY['2차전지 title1'], ARRAY['2차전지 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('전기차', '2025-05-05', ARRAY['전기차 title1'], ARRAY['전기차 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('AI 챗봇(챗GPT 등)', '2025-05-05', ARRAY['AI 챗봇(챗GPT 등) title1'], ARRAY['AI 챗봇(챗GPT 등) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('지능형로봇/인공지능(AI)', '2025-05-05', ARRAY['지능형로봇/인공지능(AI) title1'], ARRAY['지능형로봇/인공지능(AI) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('폐배터리', '2025-05-05', ARRAY['폐배터리 title1'], ARRAY['폐배터리 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('클라우드 컴퓨팅', '2025-05-05', ARRAY['클라우드 컴퓨팅 title1'], ARRAY['클라우드 컴퓨팅 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('시스템반도체', '2025-05-05', ARRAY['시스템반도체 title1'], ARRAY['시스템반도체 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('HBM(고대역폭메모리)', '2025-05-05', ARRAY['HBM(고대역폭메모리) title1'], ARRAY['HBM(고대역폭메모리) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('자율주행차', '2025-05-05', ARRAY['자율주행차 title1'], ARRAY['자율주행차 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('풍력에너지', '2025-05-05', ARRAY['풍력에너지 title1'], ARRAY['풍력에너지 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('태양광에너지', '2025-05-05', ARRAY['태양광에너지 title1'], ARRAY['태양광에너지 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('온실가스(탄소배출권)/탄소 포집·활용·저장(CCUS)', '2025-05-05', ARRAY['온실가스(탄소배출권)/탄소 포집·활용·저장(CCUS) title1'], ARRAY['온실가스(탄소배출권)/탄소 포집·활용·저장(CCUS) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('마이크로바이옴', '2025-05-05', ARRAY['마이크로바이옴 title1'], ARRAY['마이크로바이옴 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('면역항암제', '2025-05-05', ARRAY['면역항암제 title1'], ARRAY['면역항암제 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('유전자 치료제/분석', '2025-05-05', ARRAY['유전자 치료제/분석 title1'], ARRAY['유전자 치료제/분석 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('mRNA(메신저 리보핵산)', '2025-05-05', ARRAY['mRNA(메신저 리보핵산) title1'], ARRAY['mRNA(메신저 리보핵산) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('STO(토큰증권 발행)', '2025-05-05', ARRAY['STO(토큰증권 발행) title1'], ARRAY['STO(토큰증권 발행) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('카카오뱅크(kakao BANK)', '2025-05-05', ARRAY['카카오뱅크(kakao BANK) title1'], ARRAY['카카오뱅크(kakao BANK) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('UAM(도심항공모빌리티)', '2025-05-05', ARRAY['UAM(도심항공모빌리티) title1'], ARRAY['UAM(도심항공모빌리티) 아직 요약이 생성되지 않았습니다'], '2025-05-05'),
('메타버스(Metaverse)', '2025-05-05', ARRAY['메타버스(Metaverse) title1'], ARRAY['메타버스(Metaverse) 아직 요약이 생성되지 않았습니다'], '2025-05-05');



-- 7. 산업 민감도
CREATE TABLE macro_sensitivity (
    macro_variable TEXT PRIMARY KEY,
    positive_industries TEXT[],
    negative_industries TEXT[]
);

---8. 경제 용어 해설
CREATE TABLE financial_terms (
    term_id SERIAL PRIMARY KEY,
    term TEXT UNIQUE NOT NULL,
    explanation TEXT NOT NULL,
    category VARCHAR(50)  -- 용어 카테고리 (경제지표, 재무용어, 시장용어 등)
);
INSERT INTO financial_terms(term, explanation, category) VALUES
('환율', '두 통화 간 교환 비율로, 원/달러 환율 등을 통해 외환 시장 상황을 파악하는 지표', '시장용어'),
('GDP', '국내에서 일정 기간 동안 생산된 최종 재화와 서비스의 시장 가치 합계로, 경제 성장성 평가 지표', '경제지표'),
('소비자물가지수', '소비자가 구매하는 상품 및 서비스의 가격 변동을 측정하는 지수', '경제지표'),
('CPI', '소비자물가지수를 영어로 표현한 지수로, 물가 수준을 측정하는 경제지표', '경제지표'),
('인플레이션', '상품 및 서비스 전반의 가격이 지속적으로 상승하는 현상으로, 화폐 가치가 하락함을 의미', '경제지표'),
('디플레이션', '상품 및 서비스 전반의 가격이 지속적으로 하락하는 현상으로, 화폐 가치가 상승함을 의미', '경제지표'),
('기축통화', '국제 거래 및 결제에서 기준으로 사용되는 통화로, 달러화가 대표적', '시장용어'),
('FTA', '자유무역협정으로, 국가 간 관세 및 무역 장벽을 낮춰 교역을 촉진하는 협정', '무역용어'),
('금리', '자금의 대여·차용에 대한 대가로 지불되는 이자율로, 금융시장과 경제 전반에 큰 영향을 미침', '시장용어'),
('PER', '주가를 주당순이익(EPS)으로 나눈 비율로, 기업의 수익성 대비 주가 수준을 평가하는 지표', '재무용어'),
('PBR', '주가를 주당순자산가치(BPS)로 나눈 비율로, 자산 대비 주가 수준을 평가하는 지표', '재무용어'),
('ROE', '순이익을 자기자본으로 나눈 비율로, 기업이 자본을 얼마나 효율적으로 활용했는지 보여주는 수익성 지표', '재무용어'),
('EPS', '기업의 당기순이익을 발행주식 수로 나눈 값으로, 주당순이익을 나타내는 지표', '재무용어'),
('EBITDA', '이자·세금·감가상각비 차감 전 영업이익으로, 기업의 현금창출능력을 평가하는 지표', '재무용어'),
('거래량', '일정 기간 동안 거래된 주식 수량 또는 금액으로, 시장 유동성과 투자자 관심도를 보여주는 지표', '시장용어');

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