const pool = require('../../config/db');

/**
 * 뉴스와 관련된 주식 이슈 조회 서비스
 * 주식명을 받아 해당 주식의 최근 이슈를 조회하여 HTML 형태로 반환
 */
async function getNewsStockIssue(stockName) {
    try {
        if (!stockName) return '';

        // 해당 주식의 최신 이슈 조회
        const stockIssueQuery = `
            SELECT 
                stock_code, 
                stock_name, 
                summary_title, 
                summary_detail, 
                related_indicators, 
                price_impact
            FROM stock_issue
            WHERE stock_name = $1
            ORDER BY summary_date DESC
            LIMIT 1
        `;
        
        const stockIssueResult = await pool.query(stockIssueQuery, [stockName]);
        
        if (stockIssueResult.rows.length === 0) {
            return '';
        }

        const issue = stockIssueResult.rows[0];
        const stockHtml = `
            <h5>${issue.stock_name} 최근 이슈</h5>
        `;
        
        // 이슈 내용 구성
        let issueContent = '';
        for (let i = 0; i < issue.summary_title.length; i++) {
            issueContent += `
                <div class="stock-issue">
                    <h6>${issue.summary_title[i]}</h6>
                    <p>${issue.summary_detail[i]}</p>
                    <p><strong>관련 지표:</strong> ${issue.related_indicators[i] || '-'}</p>
                    <p><strong>주가 영향:</strong> ${issue.price_impact[i] || '-'}</p>
                </div>
            `;
        }
        
        // 주식 이슈 HTML 반환
        const stockIssueHtml = stockHtml + issueContent;
        console.log('주식 이슈 조회 완료');
        return stockIssueHtml;
    } catch (error) {
        console.error('주식 이슈 조회 실패:', error);
        return '';
    }
}

module.exports = {
    getNewsStockIssue
}; 