// src/utils/classifyNews.js
const { Pool } = require("pg");

// 🔹 키워드 리스트들
const stockKeywords = [
    '실적발표', '매출', '영업이익', '순이익', '주가', '급등', '급락',
    '자사주', '배당', 'IR', '주총', '상장', '신규상장', '공모가',
    '투자유치', 'M&A', '사업보고서', '대규모계약', '신제품', '공장증설',
  ];
  
  const macroKeywords = [
    '기준금리', '금리인상', '금리동결', '연준', 'FED', 'CPI', 'PPI',
    '소비자물가지수', '고용지표', '실업률', 'GDP', '환율', '원달러',
    '달러', '엔화', '무역수지', '수출입', '경기침체', '인플레이션',
    '스태그플레이션', '디플레이션', '나스닥', 'S&P500', '다우지수', '국채금리', 'WTI',
  ];
  
  const industryKeywords = {
    "상업서비스": ["프랜차이즈", "렌탈", "배송", "고객서비스", "B2B", "B2C", "인력관리", "위탁운영"],
    "기타금융": ["여신", "리스", "캐피탈", "대부업", "저축은행", "소액대출", "신용공여", "가계대출"],
    "유통": ["유통", "소매", "편의점", "백화점", "온라인쇼핑", "리테일", "유통채널", "홈쇼핑"],
    "내구소비재및의류": ["패션", "의류", "스포츠용품", "가전", "생활가전", "브랜드", "디자인", "소비재"],
    "미디어": ["방송", "콘텐츠", "드라마", "OTT", "예능", "영상제작", "플랫폼콘텐츠", "미디어사업"],
    "운송": ["물류", "운송", "택배", "운항", "항로", "항공화물", "항만", "국제물류"],
    "음식료및담배": ["식품", "가공식품", "음료", "냉동식품", "식자재", "유제품", "가공육", "담배산업"],
    "건축소재": ["시멘트", "철근", "건자재", "석재", "타일", "단열재", "건축자재", "레미콘"],
    "소프트웨어": ["소프트웨어", "클라우드", "SaaS", "ERP", "보안솔루션", "플랫폼", "인공지능", "빅데이터"],
    "증권": ["증권사", "브로커리지", "리서치센터", "투자자문", "증권거래", "증시", "주식중개"],
    "보험": ["보험", "손해보험", "생명보험", "보험금", "보험료", "보장성보험", "정기보험", "보험시장"],
    "하드웨어": ["서버", "스토리지", "기기", "네트워크장비", "컴퓨터", "전산장비", "IT하드웨어"],
    "소재": ["소재", "화학소재", "기초소재", "신소재", "첨단소재", "원자재", "기능성소재"],
    "자본재": ["중장비", "산업기계", "생산설비", "공장장비", "설비투자", "기계장비", "제조기계"],
    "금속및광물": ["철강", "비철금속", "광물", "구리", "알루미늄", "니켈", "원광", "채굴"],
    "부동산": ["부동산", "분양", "아파트", "건물", "오피스", "공실률", "부동산시장", "임대"],
    "제약및바이오": ["제약", "바이오", "임상시험", "신약", "식약처", "바이오의약품", "치료제", "백신"],
    "통신서비스": ["통신", "5G", "데이터통신", "망사용료", "통신요금", "유무선", "망중립성", "네트워크"],
    "유틸리티": ["전력", "에너지", "전기요금", "가스요금", "전력수요", "공공요금", "전력공급"],
    "종이및목재": ["펄프", "종이", "골판지", "제지", "목재", "목재가공", "판지", "인쇄용지"],
    "은행": ["은행", "예대마진", "기준금리", "금리", "예금", "대출", "수신", "은행권"],
    "의료장비및서비스": ["의료기기", "의료장비", "영상진단", "수술장비", "의료서비스", "병원경영", "진단기기"],
    "에너지": ["석유", "가스", "전력", "재생에너지", "태양광","풍력", "발전", "LNG", "전력망", "전력발전"],
    "자동차및부품": ["자동차", "완성차", "전기차", "내연기관","부품업체", "자동차부품", "모빌리티", "공급망", "카메이커"],
    "소비자서비스": ["호텔", "여행", "레저", "엔터테인먼트","교육서비스", "헬스케어서비스", "공연", "관광산업", "숙박"],
    "생활용품": ["생활용품", "가정용품", "욕실용품", "청소용품","위생용품", "휴지", "섬유제품", "주방용품", "퍼스널케어"],
    "반도체": ["반도체", "메모리", "DRAM", "NAND","파운드리", "웨이퍼", "미세공정", "반도체장비", "로직칩"],
    "디스플레이": ["디스플레이", "OLED", "LCD", "AMOLED","TFT", "패널", "디스플레이장비", "LED", "터치스크린"],

};
  
  const themeKeywords = {
    "2차전지": ["2차전지", "배터리", "양극재", "음극재", "전해질", "전고체", "리튬이온", "배터리팩"],
    "전기차": ["전기차", "EV", "완속충전", "급속충전", "충전소", "전기차보급", "전기차수요", "전기차인프라"],
    "AI 챗봇(챗GPT 등)": ["AI", "챗봇", "챗GPT", "대화형 AI", "생성형AI", "언어모델", "GPT기반", "프롬프트엔지니어링"],
    "지능형로봇/인공지능(AI)": ["지능형로봇", "AI로봇", "인공지능", "자율로봇", "로봇자동화", "산업용로봇", "AI기술"],
    "폐배터리": ["폐배터리", "배터리재활용", "리사이클링", "자원순환", "리튬회수", "2차전지회수"],
    "클라우드 컴퓨팅": ["클라우드", "클라우드컴퓨팅", "퍼블릭클라우드", "IaaS", "PaaS", "SaaS", "데이터센터", "클라우드인프라"],
    "시스템반도체": ["시스템반도체", "비메모리", "로직반도체", "팹리스", "SoC", "AI반도체", "설계반도체"],
    "HBM(고대역폭메모리)": ["HBM", "고대역폭메모리", "HBM3", "HBM2e", "고속메모리", "AI용메모리"],
    "자율주행차": ["자율주행", "ADAS", "센서융합", "라이다", "레벨4", "자율차", "자율주행시스템"],
    "풍력에너지": ["풍력", "풍력발전", "해상풍력", "육상풍력", "풍력터빈", "재생에너지"],
    "태양광에너지": ["태양광", "태양광패널", "모듈효율", "태양전지", "재생에너지", "신재생"],
    "온실가스(탄소배출권)/탄소 포집·활용·저장(CCUS)": ["온실가스", "탄소배출", "탄소배출권", "CCUS", "탄소중립", "탄소감축", "탄소시장"],
    "마이크로바이옴": ["마이크로바이옴", "장내미생물", "유익균", "균총분석", "마이크로플로라"],
    "면역항암제": ["면역항암제", "면역세포치료", "PD-1", "PD-L1", "항암면역반응", "종양면역"],
    "유전자 치료제/분석": ["유전자치료", "유전자편집", "CRISPR", "유전자분석", "DNA치료", "유전질환", "정밀의료"],
    "mRNA(메신저 리보핵산)": ["mRNA", "메신저RNA", "백신플랫폼", "mRNA기반치료", "RNA기술", "mRNA백신"],
    "STO(토큰증권 발행)": ["STO", "토큰증권", "디지털증권", "증권토큰", "자산토큰화", "분산원장", "토큰발행"],
    "카카오뱅크(kakao BANK)": ["인터넷은행", "카카오뱅크", "비대면계좌", "모바일뱅킹", "디지털뱅킹", "간편송금", "예적금상품"],
    "UAM(도심항공모빌리티)": ["UAM", "도심항공", "에어택시", "수직이착륙", "플라잉카", "하늘길", "모빌리티혁신"],
    "메타버스(Metaverse)": ["메타버스", "가상현실", "VR", "AR", "XR", "디지털아바타", "버추얼플랫폼"]
};

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function getAllStockNames() {
    const result = await pool.query("SELECT stock_name FROM tmp_stock");
    return result.rows.map(row => row.stock_name);
}

function countExact(keyword, text) {
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'g');
    return (text.match(pattern) || []).length;
}

function weightedCount(keyword, title, content, titleWeight = 10, contentWeight = 1) {
    return (title.split(keyword).length - 1) * titleWeight + (content.split(keyword).length - 1) * contentWeight;
}

function weightedCountCompany(keyword, title, content, titleWeight = 10, contentWeight = 1) {
    return countExact(keyword, title) * titleWeight + countExact(keyword, content) * contentWeight;
}

async function classifyArticle(title, content, companyList, threshold = 3) {
    const scores = { 개별주: 0, 산업군: 0, 테마: 0, 전반적: 0 };
    const representatives = { 개별주: null, 산업군: null, 테마: null, 전반적: null };

    const stockDetails = [];
    let stockKeywordScore = 0;
    companyList.forEach(name => {
        const score = weightedCountCompany(name, title, content);
        if (score > 0) stockDetails.push({ name, score });
    });
    stockKeywords.forEach(kw => {
        stockKeywordScore += weightedCount(kw, title, content);
    });
    if (stockDetails.length > 0) {
        stockDetails.sort((a, b) => b.score - a.score);
        scores['개별주'] = stockDetails[0].score + stockKeywordScore;
        representatives['개별주'] = stockDetails[0].name;
    } else {
        //scores['개별주'] = stockKeywordScore;
        scores['개별주'] = 0;  //주식명 언급 없으면 강제로 제외시킴
    }

    let bestIndustry = { name: null, score: 0 };
    for (const [industry, keywords] of Object.entries(industryKeywords)) {
        let total = 0;
        keywords.forEach(kw => {
            total += weightedCount(kw, title, content);
        });
        if (total > bestIndustry.score) bestIndustry = { name: industry, score: total };
    }
    scores['산업군'] = bestIndustry.score;
    representatives['산업군'] = bestIndustry.name;

    let bestTheme = { name: null, score: 0 };
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
        let total = 0;
        keywords.forEach(kw => {
            total += weightedCount(kw, title, content);
        });
        if (total > bestTheme.score) bestTheme = { name: theme, score: total };
    }
    scores['테마'] = bestTheme.score;
    representatives['테마'] = bestTheme.name;

    let macroScore = 0;
    macroKeywords.forEach(kw => {
        macroScore += weightedCount(kw, title, content, 20, 10);
    });
    scores['전반적'] = macroScore;
    representatives['전반적'] = macroScore > 0 ? '거시경제' : null;

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const category = best[1] >= threshold ? best[0] : '그 외';
    const representative = category !== '그 외' ? representatives[category] : null;

    return { category, representative };
}

module.exports = {
    classifyArticle,
    getAllStockNames,
    stockKeywords,
    macroKeywords,
    industryKeywords,
    themeKeywords
};