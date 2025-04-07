require('dotenv').config();

// Default to Gemini only, removing the hybrid approach
const AI_PROVIDER = 'gemini';

const GEMINI_CONFIG = {
  apiKey: process.env.GEMINI_API_KEY || '',
  modelName: process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash',
  maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '2048', 10),
  temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.4'),
  topK: parseInt(process.env.GEMINI_TOP_K || '40', 10),
  topP: parseFloat(process.env.GEMINI_TOP_P || '0.8'),
};

// Keep Claude config for backward compatibility but it will not be used
const CLAUDE_CONFIG = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  modelName: process.env.CLAUDE_MODEL_NAME || 'claude-3-sonnet-20240229',
  maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '2048', 10),
  temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.5'),
};

module.exports = {
  provider: AI_PROVIDER,
  gemini: GEMINI_CONFIG,
  claude: CLAUDE_CONFIG,
};