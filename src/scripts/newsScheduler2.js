const cron = require('node-cron');
const { exec } = require('child_process');
const dayjs = require('dayjs');
const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

// 로그 함수
function log(message, type = 'info') {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

// 명령어 실행 함수 (promise 기반)
function runCommand(command, label) {
    return new Promise((resolve, reject) => {
        log(`🟡 [START] ${label}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                log(`❌ [ERROR] ${label}: ${error.message}`, 'error');
                reject(error);
                return;
            }
            log(`✅ [DONE] ${label}`, 'success');
            if (stdout) log(`📤 [OUTPUT] ${label}:\n${stdout}`);
            if (stderr) log(`⚠️ [STDERR] ${label}:\n${stderr}`, 'error');
            resolve();
        });
    });
}

// 전체 뉴스 처리 흐름
async function processNews() {
    log('🔁 Starting full news processing pipeline...');

    try {
        // 1. Crawl
        log('➡️ Step 1: Starting news crawling');
        await runCommand('npm run crawl:news', 'News Crawling');

        // 2. Classify
        log('➡️ Step 2: Starting news classification');
        await runCommand('npm run start:classify', 'News Classification');

        // 3. Process news terms
        log('➡️ Step 3: Starting news terms processing');
        await runCommand('npm run start:getTerms', 'News Terms Processing');

        // 4. Summarize
        log('➡️ Step 4: Starting news summarization');
        await runCommand('npm run start:geminiSummarize', 'News Summarization');

        // 5. Evaluate and resummarize if needed
        log('➡️ Step 5: Starting evaluation/resummarization loop');
        let badCount = Infinity;
        let loopCount = 0;

        const maxResummarizeAttempts = 2;

        while (badCount > 0 && loopCount < maxResummarizeAttempts) {
            loopCount++;
            log(`🔁 Evaluation loop #${loopCount}`);

            // 4-1. Evaluate
            await runCommand('npm run start:evaluate', 'Summary Evaluation');

            // 4-2. Count bad summaries
            log('🔍 Checking bad summaries...');
            badCount = await countBadSummaries();
            log(`📊 Bad summaries remaining: ${badCount}`);

            if (badCount > 0) {
                // 4-3. Resummarize
                log('🛠️ Resummarizing low-quality summaries...');
                await runCommand('npm run start:resummarize', 'Resummarization');
            }
        }

        log('🎉 All summaries passed evaluation! Pipeline completed.');

    } catch (err) {
        log(`❗ Error in news pipeline: ${err.message}`, 'error');
    }
}

// 🔍 요약 품질이 낮은 개수 조회
async function countBadSummaries() {
    return new Promise((resolve, reject) => {
        const client = new Client({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
        });

        client.connect();

        const query = `
            SELECT COUNT(*) FROM news_summary
            WHERE rouge1 IS NOT NULL AND (rouge1 < 0.2 OR rougeL < 0.2 OR bleu < 0.2);
        `;

        client.query(query, (err, result) => {
            client.end();
            if (err) {
                log(`❗ PostgreSQL query error: ${err.message}`, 'error');
                reject(err);
            } else {
                const count = parseInt(result.rows[0].count, 10);
                resolve(count);
            }
        });
    });
}

// 매일 오전 9시에 실행
cron.schedule('0 9 * * *', () => {
    log('🕘 Scheduled run triggered at 9 AM');
    processNews();
});

// 즉시 한 번 실행
log('🚀 Initial run started');
processNews();

// 종료 핸들링
process.on('SIGINT', () => {
    log('🛑 Shutting down scheduler...');
    process.exit(0);
});
process.on('uncaughtException', (err) => {
    log(`❗ Uncaught Exception: ${err.message}`, 'error');
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    log(`❗ Unhandled Rejection: ${reason}`, 'error');
    process.exit(1);
});
