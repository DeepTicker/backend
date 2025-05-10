// src/scripts/newsScheduler.js
//TODO : 뉴스 gemini 요약을 서버가 켜진 동안 요약안되어 있는게 있으면 실행하기기
const cron = require('node-cron');
const { exec } = require('child_process');
const dayjs = require('dayjs');

// 로깅 함수
function log(message, type = 'info') {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

// 뉴스 처리 함수
async function processNews() {
    log('Starting news processing...');
    
    try {
        // 1. Crawl news
        log('Starting news crawling...');
        await new Promise((resolve, reject) => {
            exec('npm run crawl:news', (error, stdout, stderr) => {
                if (error) {
                    log(`Crawling error: ${error}`, 'error');
                    reject(error);
                    return;
                }
                log('News crawling completed', 'success');
                if (stdout) log(`Crawler output: ${stdout}`);
                resolve();
            });
        });

        // 2. Classify news
        log('Starting news classification...');
        await new Promise((resolve, reject) => {
            exec('npm run classify:news', (error, stdout, stderr) => {
                if (error) {
                    log(`Classification error: ${error}`, 'error');
                    reject(error);
                    return;
                }
                log('News classification completed', 'success');
                if (stdout) log(`Classifier output: ${stdout}`);
                resolve();
            });
        });

        // 3. Start summarization
        log('Starting news summarization...');
        await new Promise((resolve, reject) => {
            exec('node src/scripts/batchSummarizeNews.js', (error, stdout, stderr) => {
                if (error) {
                    log(`Summarization error: ${error}`, 'error');
                    reject(error);
                    return;
                }
                log('News summarization completed', 'success');
                if (stdout) log(`Summarizer output: ${stdout}`);
                resolve();
            });
        });
        
    } catch (err) {
        log(`Error in news processing: ${err.message}`, 'error');
    }
}

// Run at 9 AM every day
cron.schedule('0 9 * * *', () => {
    log('Scheduled run triggered');
    processNews().catch(err => {
        log(`Error in scheduled run: ${err.message}`, 'error');
    });
});

// 실행 즉시 한 번 실행
log('Starting initial news processing...');
processNews().catch(err => {
    log(`Error in initial run: ${err.message}`, 'error');
});

log('News processing scheduler started - will run daily at 9 AM');

// 프로세스 종료 처리
process.on('SIGINT', () => {
    log('Shutting down scheduler...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    log(`Uncaught Exception: ${err.message}`, 'error');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
});