// config/gemini.js
const { GoogleGenAI } = require("@google/genai");

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function generateText(prompt) {
  try {
    const res = await client.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return res.text;
  } catch (error) {
    console.error("Gemini Generate Error:", error);
    throw error;
  }
}

module.exports = { generateText };
