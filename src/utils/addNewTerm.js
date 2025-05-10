// utils/addNewTerm.js
// 용어가 db에 없는 경우 : 새로운 용어 검색 후 DB에 추가하는 함수

const axios = require('axios');
const cheerio = require('cheerio');
const pool = require('../../config/db');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


// 3. 한국은행 경제용어사전에서 용어 검색 및 크롤링
async function crawlBokDictionary(term) {
    try {
      // 한국은행 경제용어사전 검색 URL
      const url = `https://www.bok.or.kr/portal/ecEdu/ecWordDicary/search.do?menuNo=200688&query=${encodeURIComponent(term)}`;
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      
      // 검색 결과에서 title 태그 찾기
      const titles = $('p.title').map((i, el) => $(el).text().trim()).get();
      
      // 검색어와 일치하는 title 찾기
      let matchIndex = -1;
      for (let i = 0; i < titles.length; i++) {
        const title = titles[i];
        
        // 1. 정확히 일치하는 경우
        if (title.toLowerCase() === term.toLowerCase()) {
          matchIndex = i;
          break;
        }
        
        // 2. "(" 기준으로 분리해서 확인
        if (title.includes('(')) {
          const parts = title.split('(');
          const mainTerm = parts[0].trim().toLowerCase();
          const bracketTerm = parts[1].replace(')', '').trim().toLowerCase();
          
          if (mainTerm === term.toLowerCase() || bracketTerm === term.toLowerCase()) {
            matchIndex = i;
            break;
          }
        }
        
        // 3. 포함 여부 확인 (가장 느슨한 조건)
        if (title.toLowerCase().includes(term.toLowerCase())) {
          matchIndex = i;
          break;
        }
      }
      
      // 일치하는 용어를 찾은 경우
      if (matchIndex !== -1) {
        // 해당 인덱스의 wordCont 내용 추출
        const explanation = $('div#wordCont.boxInfoR').eq(matchIndex).text().trim();
        return explanation;
      }
      
      return null;
    } catch (error) {
      console.error(`용어 "${term}" 크롤링 중 오류:`, error);
      return null;
    }
  }
  
  module.exports = { crawlBokDictionary };

// 4. 중학생 수준으로 설명 단순화 (Gemini API 활용)
async function simplifyExplanation(explanation) {
  const prompt = `
    다음 경제 용어 설명을 중학생이 이해할 수 있는 쉬운 말로 바꿔주세요:
    "${explanation}"
    
    - 전문 용어는 피하고 쉬운 단어로 설명해주세요
    - 비유나 예시를 사용해도 좋습니다
    - 2-3문장으로 간결하게 설명해주세요
  `;
  
  const result = await model.generateContent(prompt);
  return result.response.candidates[0].content.parts[0].text.trim();
}

// 5. DB에 새 용어 저장
async function saveNewTerm(term, explanation, category = '경제용어') {
  try {
    await pool.query(
      'INSERT INTO financial_terms(term, explanation, category) VALUES($1, $2, $3)',
      [term, explanation, category]
    );
    console.log(`새 용어 "${term}" 저장 완료`);
    return true;
  } catch (error) {
    console.error(`용어 "${term}" 저장 중 오류:`, error);
    return false;
  }
}

module.exports = { 
    crawlBokDictionary,
    simplifyExplanation,
    saveNewTerm
  };