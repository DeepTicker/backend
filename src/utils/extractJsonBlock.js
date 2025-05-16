function extractJsonBlock(text) {
    const match = text.match(/```json([\s\S]*?)```/);
    if (match && match[1]) {
      return match[1].trim();
    }
  
    // fallback: 대괄호 블록 찾기
    const altMatch = text.match(/\[\s*{[\s\S]*?}\s*]/);
    if (altMatch) {
      return altMatch[0];
    }
  
    throw new Error("JSON 블록을 추출할 수 없습니다.");
  }

  module.exports = { extractJsonBlock }; 