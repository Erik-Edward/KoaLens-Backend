// src/routes/index.ts
import { Router } from 'express';
import analyzeRoutes from './analyzeRoutes';
import aiRoutes from './aiRoutes';
import counterRoutes from './counterRoutes';
import reportRoutes from './reportRoutes';
import videoAnalysisRoutes from './videoAnalysis';
import testGeminiRoutes from './testGemini';
import { logger } from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

// Create a router instance
const router = Router();

// Basic healthcheck endpoint
router.get('/', (_req, res) => {
  // Add API version info to health check
  res.json({
    status: 'ok',
    message: 'KoaLens API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    apiVersion: '1.1.0',
    endpoints: {
      video: '/video/analyze-video',
      alternateVideo: '/analyze-video',  // New alternate endpoint
      test: process.env.ENABLE_TEST_ROUTES === 'true' ? '/test' : 'disabled'
    }
  });
});

// Enhanced logging for mounted routes
logger.info('Mounting KoaLens API routes:');
logger.info('- /analyze (analyzeRoutes) - Legacy analyze endpoints');
logger.info('- /ai (aiRoutes) - AI interaction endpoints');
logger.info('- /counter (counterRoutes) - Usage counters');
logger.info('- /reports (reportRoutes) - Reporting functionality');
logger.info('- /video (videoAnalysisRoutes) - Video analysis endpoints');

// Mount the routes
router.use('/analyze', analyzeRoutes);
router.use('/ai', aiRoutes);
router.use('/counter', counterRoutes);
router.use('/reports', reportRoutes);
router.use('/video', videoAnalysisRoutes);

// Add alias route for counters (plural) to match mobile app expectations
router.use('/counters', counterRoutes);

// Add special top-level route for video analysis for backward compatibility
// This addresses the issue with the mobile app expecting /analyze-video
router.post('/analyze-video', (req: Request, res: Response, next: NextFunction) => {
  logger.info('Request received at /analyze-video (root) - forwarding to video analysis handler');
  // Forward the request to the video analysis route
  req.url = '/analyze-video'; // This is needed for the videoAnalysisRoutes router to handle it
  videoAnalysisRoutes(req, res, next);
});

// Log specific video analysis endpoint which is commonly accessed
logger.info('Video analysis endpoints available at:');
logger.info('- /video/analyze-video (primary endpoint)');
logger.info('- /analyze-video (compatibility endpoint)');

// Mount diagnostic and test routes
// Not mounted in production by default for security
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ROUTES === 'true') {
  logger.info('Mounting test routes - accessible in non-production or with ENABLE_TEST_ROUTES=true');
  logger.info('- /test (testGeminiRoutes) - Includes test endpoints for API validation');
  router.use('/test', testGeminiRoutes);
  
  // Add test route aliases for better discoverability
  router.get('/api-status', (req, res) => {
    res.redirect('/test/test-api-key');
  });
  
  router.get('/video-test', (req, res) => {
    res.redirect('/test/test-video-processing');
  });
} else {
  logger.warn('Test routes NOT mounted in production. Set ENABLE_TEST_ROUTES=true to enable test endpoints.');
}

// Debug-logga miljövariabler för test-routes
logger.info('Environment settings:', {
  NODE_ENV: process.env.NODE_ENV || 'not set',
  ENABLE_TEST_ROUTES: process.env.ENABLE_TEST_ROUTES || 'not set',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'configured (length: ' + process.env.GEMINI_API_KEY.length + ')' : 'NOT CONFIGURED',
  GEMINI_MODEL_NAME: process.env.GEMINI_MODEL_NAME || 'default model',
  routesEnabled: (process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ROUTES === 'true')
});

// Improved fallback for catch-all route with better diagnostics
router.all('*', (req, res) => {
  logger.warn('Endpoint not found', {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'accept': req.headers['accept']
    }
  });

  // Return a helpful 404 response with available endpoints
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: {
      root: '/',
      video: '/video/analyze-video', 
      alternateVideo: '/analyze-video',
      test: process.env.ENABLE_TEST_ROUTES === 'true' ? '/test/test-api-key' : 'disabled',
      videoTest: process.env.ENABLE_TEST_ROUTES === 'true' ? '/test/test-video-processing' : 'disabled'
    },
    message: 'Please check the path and HTTP method'
  });
});

export default router;