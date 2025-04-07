import { Router, Request, Response, RequestHandler } from 'express';
import AIServiceFactory from '../services/aiServiceFactory';
import promptManager from '../utils/promptManager';
import outputParser from '../utils/outputParser';
import { logger } from '../utils/logger';
import geminiService from '../services/geminiService';

const router = Router();

// Simple test endpoint to test Gemini API
router.post('/test-gemini', (async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      res.status(400).json({
        error: 'Missing required field: prompt'
      });
      return;
    }
    
    logger.info('Testing Gemini API with prompt', { promptLength: prompt.length });
    
    // Get the AI service (should be Gemini based on config)
    const aiService = await AIServiceFactory.getService();
    
    // Generate content
    const result = await aiService.generateContent(prompt);
    
    // Return the raw result
    res.json({
      service: 'gemini',
      result
    });
  } catch (error: any) {
    logger.error('Gemini test error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Gemini API error',
      message: error.message
    });
  }
}) as RequestHandler);

// Test endpoint for ingredient analysis
router.post('/test-ingredients', (async (req: Request, res: Response) => {
  try {
    const { ingredients } = req.body;
    
    if (!ingredients) {
      res.status(400).json({
        error: 'Missing required field: ingredients'
      });
      return;
    }
    
    // Load default templates if not already loaded
    promptManager.loadDefaultTemplates();
    
    // Format the prompt with ingredients
    const prompt = promptManager.format('ingredientsAnalysis', {
      ingredients: Array.isArray(ingredients) ? ingredients.join(', ') : ingredients
    });
    
    logger.info('Testing ingredient analysis', { ingredients });
    
    // Get the AI service
    const aiService = await AIServiceFactory.getService();
    
    // Generate content
    const result = await aiService.generateContent(prompt);
    
    // Parse the result
    const parsedResult = outputParser.parseAnalysisResult(result);
    
    // Return the parsed result
    res.json({
      service: 'gemini',
      rawResult: result,
      parsedResult
    });
  } catch (error: any) {
    logger.error('Ingredient analysis test error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Ingredient analysis error',
      message: error.message
    });
  }
}) as RequestHandler);

// Test endpoint for the Gemini API key and basic functionality
router.get('/test-api-key', (async (_req: Request, res: Response) => {
  try {
    // Create a simple prompt to test the API key
    const testPrompt = "Please respond with 'API key valid' if you can read this message.";
    
    // Log the test attempt
    logger.info('Testing Gemini API key validity');
    
    // Attempt to generate content with a simple prompt
    const result = await geminiService.generateContent(testPrompt);
    
    // Check the API configuration
    const apiKeyExists = !!process.env.GEMINI_API_KEY;
    const apiKeyLength = apiKeyExists ? process.env.GEMINI_API_KEY!.length : 0;
    
    // Return status and information about the API key
    res.json({
      success: true,
      message: 'Gemini API key is valid and functioning',
      apiKeyConfigured: apiKeyExists,
      apiKeyLength: apiKeyLength,
      modelName: process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash',
      response: result.substring(0, 100) // Just return the first 100 chars for safety
    });
  } catch (error: any) {
    logger.error('Gemini API key test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Gemini API key test failed',
      message: error.message,
      apiKeyConfigured: !!process.env.GEMINI_API_KEY
    });
  }
}) as RequestHandler);

// Test endpoint specifically for video processing capabilities
router.post('/test-video-processing', (async (req: Request, res: Response) => {
  try {
    // You can optionally accept a small test video as base64, but for simplicity we'll use a placeholder here
    const { videoBase64 } = req.body;
    
    // If no video is provided, we'll just test the ffmpeg installation
    if (!videoBase64) {
      // Check if ffmpeg is installed by importing VideoOptimizer
      const { VideoOptimizer } = require('../utils/videoOptimizer');
      const optimizer = new VideoOptimizer();
      
      // Return the test results
      res.json({
        success: true,
        message: 'Video processing test successful (ffmpeg check only)',
        ffmpegInstalled: optimizer.isFfmpegInstalled(),
        note: 'No video processing was performed as no video data was provided',
        apiKeyConfigured: !!process.env.GEMINI_API_KEY
      });
      return;
    }
    
    // If video is provided, attempt simple processing with Gemini
    const testPrompt = "Describe what you see in this video in one sentence.";
    logger.info('Testing video processing with Gemini', { videoDataSize: videoBase64.length });
    
    // Get MIME type (or default to mp4)
    const mimeType = req.body.mimeType || 'video/mp4';
    
    // Test direct video content generation
    const result = await geminiService.generateContentFromMedia(testPrompt, videoBase64, mimeType);
    
    res.json({
      success: true,
      message: 'Video processing test successful',
      response: result.substring(0, 200),
      apiKeyConfigured: !!process.env.GEMINI_API_KEY,
      videoProcessed: true
    });
  } catch (error: any) {
    logger.error('Video processing test failed', { 
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Video processing test failed',
      message: error.message,
      apiKeyConfigured: !!process.env.GEMINI_API_KEY,
      detail: error.stack
    });
  }
}) as RequestHandler);

export default router;