// Script to verify environment configuration
const aiConfig = require('./src/config/ai-config');
const dotenv = require('dotenv');

console.log('Loading environment variables...');
const dotenvResult = dotenv.config();
console.log('Dotenv result:', dotenvResult.parsed ? 'Loaded successfully' : 'Failed to load');

console.log('\nCurrent AI configuration:');
console.log('Provider:', aiConfig.provider);
console.log('Gemini Model:', aiConfig.gemini.modelName);
// console.log('Claude Model:', aiConfig.claude.modelName); // REMOVED

console.log('\nGemini API Key:', aiConfig.gemini.apiKey ? 'Configured ✓' : 'Missing ✗');
// console.log('Claude API Key:', aiConfig.claude.apiKey ? 'Configured ✓' : 'Missing ✗'); // REMOVED

console.log('\nVerification complete!');