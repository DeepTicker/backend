//npm install axios cheerio dayjs 이거 설치해야함!
//npm install chardet


require("dotenv").config();

const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const chardet = require("chardet");
const pool = require('../../config/db');
const dayjs = require("dayjs");
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const baseURL = "https://finance.naver.com/news/mainnews.naver";

async function crawl() {
  const today = dayjs(); // 오늘
  const endDate = today.subtract(0, "day"); // 2일 전

  let currentDate = today;
  let page = 1;
  const results = [];

  // DB에서 최대 news_id 및 기존 제목 Set 가져오기
  const { rows: idRow } = await pool.query("SELECT MAX(id) AS max_id FROM news_raw");
  let id = (idRow[0].max_id || 0) + 1;

  const { rows: existingRows } = await pool.query("SELECT title FROM news_raw");
  const titleSet = new Set(existingRows.map((r) => r.title));


    while (true) {
        const dateStr = currentDate.format("YYYY-MM-DD");
        const url = `${baseURL}?date=${dateStr}&page=${page}`;
        console.log(`📄 [${dateStr}] page ${page}`);
    
        try {
        const htmlRes = await axios.get(url, {
            responseType: "arraybuffer",
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        const decodedListHTML = iconv.decode(htmlRes.data, "euc-kr");
        const $ = cheerio.load(decodedListHTML);
    
        const items = $(".block1");
        if (items.length === 0) break;
    
        for (const el of items) {
            if (results.length >= 10) break; // ✅ 최대 10개까지만
    
            try {
            const $el = $(el);
            const subject = $el.find(".articleSubject").text().trim();
            const link = $el.find(".articleSubject > a").attr("href");
            const press = $el.find(".press").text().trim();
            const rawDate = $el.find(".wdate").text().trim();
            const parsedDate = dayjs(rawDate, "YYYY-MM-DD HH:mm:ss").toDate();
    
            if (titleSet.has(subject)) {
                console.log(`🛑 중복 뉴스 발견: ${subject} → 크롤링 종료`);
                break;
            }
    
            const article_id = link.match(/article_id=(\d+)/)?.[1];
            const office_id = link.match(/office_id=(\d+)/)?.[1];
            if (!article_id || !office_id) continue;
    
            const newsURL = `https://n.news.naver.com/mnews/article/${office_id}/${article_id}`;
    
            const articleRes = await axios.get(newsURL, {
                responseType: "arraybuffer",
                headers: { "User-Agent": "Mozilla/5.0" },
            });
    
            const encoding = chardet.detect(articleRes.data) || "euc-kr";
            const decodedBody = iconv.decode(articleRes.data, encoding);
            const $article = cheerio.load(decodedBody);
    
            const content =
                $article("article._article_content").text().trim() ||
                $article("#dic_area").text().trim() ||
                "[본문 없음]";
    
            const reporter =
                $article("em.media_end_head_journalist_name").text().trim() ||
                "[기자 없음]";
    
            let image_url = null;
            let image_desc = null;
    
            const imgTag = $article("img#img1").first();
            if (imgTag.length > 0) {
                image_url = imgTag.attr("data-src") || null;
            }
    
            const imgDescTag = $article("em.img_desc").first();
            if (imgDescTag.length > 0) {
                image_desc = imgDescTag.text().trim();
            }
    
            results.push({
                title: subject,
                content,
                press,
                reporter,
                url: newsURL,
                date: parsedDate,
                image_url,
                image_desc,
            });
    
            titleSet.add(subject);
            console.log(`✅ ${subject} | ${press} | ${reporter} | ${parsedDate}`);
            await sleep(200);
            } catch (e) {
            console.warn("❌ 내부 뉴스 파싱 오류:", e.message);
            }
        }
    
        // ✅ 결과 10개 채워졌으면 루프 탈출
        if (results.length >= 10) break;
    
        if ($(".pgRR").length > 0) {
            page += 1;
        } else {
            currentDate = currentDate.subtract(1, "day");
            if (currentDate.isBefore(endDate)) break;
            page = 1;
        }
        } catch (e) {
        console.error("❌ 페이지 로딩 실패:", e.message);
        break;
        }
    }
    
}