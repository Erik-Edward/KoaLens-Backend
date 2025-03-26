require('dotenv').config();

const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // 'gemini' or 'claude'

const GEMINI_CONFIG = {
  apiKey: process.env.GEMINI_API_KEY || '',
  modelName: process.env.GEMINI_MODEL_NAME || 'gemini-2.5-pro-exp-03-25',
  maxOutputTokens: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '2048', 10),
  temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.4'),
  topK: parseInt(process.env.GEMINI_TOP_K || '40', 10),
  topP: parseFloat(process.env.GEMINI_TOP_P || '0.8'),
};

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