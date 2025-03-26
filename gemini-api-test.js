require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const modelName = 'gemini-2.5-pro-exp-03-25'; // Using the specific experimental model

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testGeminiApi(retries = 5) { // Increased retries
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Testing connection to Gemini API...`);
      console.log(`Using model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Hello from KoaLens! Please respond with a very brief message.');
      console.log('Response from Gemini API:');
      console.log(result.response.text());
      console.log('API connection works!');
      return; // Success, exit function
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      console.error(`Status code: ${error.status || 'unknown'}`);
      
      if (attempt < retries) {
        const waitTime = 3000 * attempt; // Longer wait times
        console.log(`Waiting ${waitTime/1000} seconds before retrying...`);
        await delay(waitTime);
      } else {
        console.error('All attempts failed. The model might be temporarily unavailable.');
      }
    }
  }
}

testGeminiApi();