// src/utils/addNewTerm.js

const axios = require('axios');
const cheerio = require('cheerio');
const pool = require('../../config/db');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function crawlBokDictionary(term) {
  try {
    const url = `https://www.bok.or.kr/portal/ecEdu/ecWordDicary/search.do?menuNo=200688&query=${encodeURIComponent(term)}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const titles = $('p.title').map((i, el) => $(el).text().trim()).get();

    let matchIndex = titles.findIndex(t => t.toLowerCase().includes(term.toLowerCase()));
    if (matchIndex !== -1) {
      const explanation = $('div#wordCont.boxInfoR').eq(matchIndex).text().trim();
      return explanation;
    }
    return null;
  } catch (error) {
    console.error(`BOK 검색 오류 (${term}):`, error);
    return null;
  }
}

async function generateExplanationWithLLM(term) {
  const prompt = `${term}은(는) 무엇인가요? 경제 초보자가 이해할 수 있게 설명해주세요.`;
  const result = await model.generateContent(prompt);
  return result.response.candidates[0].content.parts[0].text.trim();
}

function classifyTerm(term, explanation) {
  if (term.includes('금리') || explanation.includes('통화정책')) return '정책';
  if (term.includes('지수') || explanation.includes('시장')) return '시장 용어';
  if (explanation.includes('기업') || explanation.includes('회계')) return '기업 재무';
  return '기타';
}

async function simplifyExplanation(explanation) {
  const prompt = `다음 설명을 중학생이 이해할 수 있게 바꿔주세요 (2-3문장):\n"${explanation}"`;
  const result = await model.generateContent(prompt);
  return result.response.candidates[0].content.parts[0].text.trim();
}

async function saveNewTerm(term, simplified, original, category) {
  try {
    await pool.query(
      'INSERT INTO financial_terms(term, explanation, original_explanation, category) VALUES($1, $2, $3, $4)',
      [term, simplified, original, category]
    );
    console.log(`✅ ${term} 저장 완료`);
  } catch (error) {
    console.error(`❌ ${term} 저장 실패:`, error);
  }
}

module.exports = { crawlBokDictionary, simplifyExplanation, saveNewTerm, generateExplanationWithLLM, classifyTerm };
