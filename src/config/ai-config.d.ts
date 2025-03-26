/**
 * TypeScript declaration for AI configuration
 */
declare const config: {
  provider: string;
  gemini: {
    apiKey: string;
    modelName: string;
    maxOutputTokens: number;
    temperature: number;
    topK: number;
    topP: number;
  };
  claude: {
    apiKey: string;
    modelName: string;
    maxTokens: number;
    temperature: number;
  };
};

export default config;