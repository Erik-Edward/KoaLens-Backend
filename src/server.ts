// src/server.ts
console.log("--- Server.ts script starting ---"); 

// === Remove Module Alias Registration ===
// // @ts-ignore - Suppress TS7016 for module-alias as it lacks types
// import moduleAlias from 'module-alias'; 
// const baseDir = __dirname; // In container, this will be /app/dist
// moduleAlias.addAliases({
//   '@': baseDir,
// });
// console.log(`--- Alias @ explicitly registered to: ${baseDir} ---`);
// === End Remove Module Alias Registration ===

// Now import other modules
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from './utils/logger';
// import winston from 'winston'; // Remove unused import
// import path from 'path'; // Remove unused import
import http from 'http';
import { WebSocketServer } from 'ws';
import { LiveAnalysisService } from './services/liveAnalysisService';

// Remove module-alias import from here
// import moduleAlias from 'module-alias'; 

// Remove Anthropic import
// import { Anthropic } from '@anthropic-ai/sdk'; 
import dotenv from 'dotenv';
// import { ANALYSIS_PROMPT, CROPPED_IMAGE_PROMPT } from '@/config/prompts'; // Old alias import
import { ANALYSIS_PROMPT, CROPPED_IMAGE_PROMPT } from './config/prompts'; 

// import analysisService from '@/services/analysisService'; // Old alias import
// import analysisService from './services/analysisService'; 

// import { logger } from './utils/logger';
// import videoAnalysisRoutes from './routes/videoAnalysis'; 
// import { handleServerError } from './middleware/errorHandler'; // File does not exist
// import { authenticate } from './middleware/auth'; // File does not exist
import apiRoutes from './routes';
import { TempFileCleaner } from './utils/tempFileCleaner';

// Import Gemini types
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig } from "@google/generative-ai";

// Relative imports (without .js extension)
import { validateIngredients } from './services/veganValidator';
// import { compressImage, getBase64Size } from './utils/imageProcessor'; // REMOVED IMPORT
import { checkUserLimit, incrementAnalysisCount } from './services/supabaseService';

// Load environment variables
dotenv.config();

// Initialize Supabase client immediately after loading env vars
// initializeSupabase(); // Function does not exist
// console.log("Supabase client initialized.");

const app = express();

// Configure security with helmet middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API server
  crossOriginEmbedderPolicy: false, // Modify as needed for your use case
}));

// Enable gzip compression
app.use(compression());

// Configure CORS with permissive settings
const corsOptions = {
  origin: '*', // Allow requests from any origin for API server
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // Cache CORS preflight for 24 hours
};
app.use(cors(corsOptions));

// Add explicit preflight handler for all routes
app.options('*', (_req, res) => {
  // Set CORS headers for preflight requests
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  res.sendStatus(200);
});

// Log CORS settings
logger.info('CORS configured with settings', { corsOptions });

// Configure Express middleware for JSON and form data
app.use(express.json({ limit: '50mb' })); // Increased limit for media uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS options for API routes
app.use('/api', (req, res, next) => {
  // Set CORS headers to allow mobile app requests
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Add custom header to indicate API version
  res.header('X-KoaLens-API-Version', '1.1.0');
  
  // Add custom header to help client identify enhanced response format
  res.header('X-KoaLens-Enhanced-Response', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Montera API-routes efter CORS-hanteringen
app.use('/api', apiRoutes);

// Lägg till direkta rutter för videoanalys i rot-nivån för att fånga upp anrop från äldre appar
app.post('/video/analyze-video', (req, res, next) => {
  logger.info('Anrop till /video/analyze-video (utan /api) - vidarebefordrar till rätt handler');
  req.url = '/video/analyze-video';
  apiRoutes(req, res, next);
});

app.post('/analyze-video', (req, res, next) => {
  logger.info('Anrop till /analyze-video (utan /api) - vidarebefordrar till rätt handler');
  req.url = '/analyze-video';
  apiRoutes(req, res, next);
});

// Starta schemalagd rensning av tillfälliga filer
TempFileCleaner.startScheduler();

// Remove Anthropic client
// const anthropic = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY
// });

// Instantiate Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Use an appropriate Gemini model

// Define Gemini generation config (adjust as needed)
const generationConfig: GenerationConfig = {
  temperature: 0.4,
  topK: 32,
  topP: 1,
  maxOutputTokens: 8192,
  responseMimeType: "application/json", // Request JSON output
};

// Define safety settings (adjust as needed)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];


// Keep interface definitions, they might still be useful structure, 
// but the parsing logic will change. Rename ClaudeAnalysisResult
interface GeminiAnalysisResult { // Renamed from ClaudeAnalysisResult
  isVegan: boolean | null;
  isUncertain: boolean;
  confidence: number;
  productName: string;
  ingredientList: string[];
  nonVeganIngredients: string[];
  uncertainIngredients: string[];
  reasoning: string;
  // Add fields Gemini might return or remove unused ones
}

interface IngredientAnalysisResult {
  isVegan: boolean | null;
  isUncertain: boolean;
  confidence: number;
  nonVeganIngredients: string[];
  uncertainIngredients: string[];
  allIngredients: string[];
  reasoning: string;
  usageUpdated?: boolean;
  usageInfo?: {
    analysesUsed: number;
    analysesLimit: number;
    remaining: number;
    isPremium?: boolean;
  };
}

// Remove unused QualityIssue interface
// interface QualityIssue { ... }

interface StandardError {
  error: 'IMAGE_QUALITY' | 'ANALYSIS_ERROR' | 'IMAGE_MISSING' | 'USAGE_LIMIT_EXCEEDED' | 'SERVER_ERROR'; // Added SERVER_ERROR
  message: string;
  details?: {
    issues?: string[];
    suggestions?: string[];
    analysesUsed?: number;
    analysesLimit?: number;
    isPremium?: boolean;
  };
}

interface AnalyzeRequestBody {
  image: string;
  isOfflineAnalysis?: boolean;
  isCroppedImage?: boolean;
  userId?: string; // Parameter för att spåra användargränser
}

// Remove Claude-specific JSON extraction function
// function extractLastJsonFromText(text: string): ClaudeAnalysisResult { ... }

// Remove or adapt Claude-specific misreading log
// function logPotentialMisreading(...) { ... }

// Adapt detectImageQualityIssues if Gemini provides different quality indicators
// function detectImageQualityIssues(...) { ... }

// Adapt determineVeganStatus to work with Gemini's output and confidence
// function determineVeganStatus(...) { ... }

// Adapt getUserFriendlyError if Gemini errors are different
// function getUserFriendlyError(...) { ... }

// --- REFACTOR analyzeImage function --- REMOVED ---
/*
const analyzeImage = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // ... function body ...
};
*/

// --- Error Handling Middleware (Keep this) ---
// ... existing code ...


// --- Route Definitions (Removing incorrect lines) ---
// app.use('/api/health', healthRoutes); // Assuming healthRoutes is handled elsewhere or removed
// app.use('/api/ai', aiRoutes); // Keep if other routes exist
// app.use('/api/analyze', analyzeRoutes); // REMOVED (Handled by apiRoutes)
// app.use('/api/counter', counterRoutes); // REMOVED (Handled by apiRoutes)
// app.use('/api/user', userRoutes); // REMOVED (Handled by apiRoutes)
// app.use('/api/video', videoRoutes); // REMOVED (Handled by apiRoutes)

// Remove specific analyze route for images
// app.post('/analyze', analyzeImage); // ROUTE REMAINS REMOVED

// --- Centralized Error Handler (Keep this) ---
// ... existing code ...

// Lägg till en ny endpoint för att kontrollera användarens användningsstatus
app.get('/usage/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validera JWT-token skulle göras här i en fullständig implementation
    // För MVP, vi förenklar genom att endast kräva användar-ID
    
    const usageInfo = await checkUserLimit(userId);
    
    res.json({
      analysesUsed: usageInfo.analysesUsed,
      analysesLimit: usageInfo.analysesLimit,
      remaining: usageInfo.isPremium ? Infinity : Math.max(0, usageInfo.analysesLimit - usageInfo.analysesUsed),
      isPremium: usageInfo.isPremium
    });
  } catch (error) {
    console.error('Error fetching usage info:', error);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Ett fel uppstod när användardata hämtades'
    });
  }
});

// Lägg till en testroute för att verifiera att API:t fungerar
app.get('/', (_req, res) => {  // Observera underscore-prefixet för oanvänd parameter
  res.json({
    status: 'ok',
    message: 'KoaLens API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Testendpoint för Supabase-anslutning
app.get('/test-supabase', async (_req, res) => {
  try {
    // const { supabase } = await import('./services/supabaseService'); // Keep this one if supabaseService exports supabase
    // If supabase is initialized elsewhere, this endpoint might need adjustment or removal
    // Assuming supabaseService exports supabase for now:
    const { supabase } = await import('./services/supabaseService'); 
    const { data, error } = await supabase
      .from('user_usage')
      .select('count(*)')
      .single();
    
    if (error) {
      console.error('Supabase connection test error:', error);
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    
    res.json({ 
      success: true, 
      message: 'Supabase connection successful', 
      data 
    });
  } catch (error) {
    console.error('Unexpected error testing Supabase:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Testroute för counter-endpoints
app.get('/test-counter/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const counterName = 'analysis_count';
    
    // Omdirigera till nya counter-API
    res.redirect(`/api/counters/${userId}/${counterName}`);
  } catch (error) {
    console.error('Error in test-counter endpoint:', error);
    res.status(500).json({
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// --- ERROR HANDLING MIDDLEWARE --- 
// This MUST be defined AFTER all other app.use() and routes
// Prefix unused parameters with underscore to satisfy linter
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("--- Error Handling Middleware Caught Error ---");
  console.error(err.message);
  if (err.originalError) {
    console.error("Original Error:", err.originalError);
  }
  console.error(err.stack);
  console.error("--- End Error --- ");

  const status = err.status || 500;
  const errorCode = err.errorCode || (status === 403 ? 'FORBIDDEN' : 'SERVER_ERROR'); // Default error code
  const message = err.message || 'Ett oväntat serverfel uppstod.';
  const details = err.details || undefined;

  res.status(status).json({
    error: errorCode,
    message: message,
    details: details
  } as StandardError);
});

// Start server
// Ensure we listen on 0.0.0.0 (all interfaces) for proper Fly.io compatibility
const PORT_STR = process.env.PORT || '8080';
const PORT = parseInt(PORT_STR, 10);
const HOST = '0.0.0.0'; // Explicitly set to 0.0.0.0 for Fly.io

// Log all environment variables for debugging
logger.info('Starting server with environment:', {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: PORT,
  HOST: HOST,
  ENABLE_TEST_ROUTES: process.env.ENABLE_TEST_ROUTES,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? `configured (length: ${process.env.GEMINI_API_KEY.length})` : 'missing'
});

// Create HTTP server explicitly 
const server = http.createServer(app);

// +++ NY WEBSOCKET-SERVER SETUP +++
// Skapa WebSocketServer och koppla den till HTTP-servern
const wss = new WebSocketServer({ server }); // Koppla till din HTTP server

logger.info('WebSocket server initialized and attached to HTTP server.');

wss.on('connection', (ws) => {
    logger.info('WebSocket client connected');
    // Skapa en ny instans av din LiveAnalysisService för varje anslutning
    try {
      new LiveAnalysisService(ws); // LiveAnalysisService hanterar resten
    } catch (serviceError) {
        logger.error('Error creating LiveAnalysisService instance:', serviceError);
        // Stäng anslutningen om servicen inte kunde skapas
        ws.close(1011, 'Internal server error initializing analysis session.');
    }

    // Grundläggande fel/stängningshantering här är ok, men LiveAnalysisService hanterar det mesta internt
    ws.on('error', (error) => {
        logger.error('Direct WebSocket connection error:', error);
    });

     ws.on('close', (code, reason) => {
         // Use Buffer.from(reason).toString() to safely convert potential Buffer reason
         const reasonString = Buffer.isBuffer(reason) ? Buffer.from(reason).toString() : String(reason);
         logger.info(`Direct WebSocket connection closed by client. Code: ${code}, Reason: ${reasonString}`);
     });
});
// +++ SLUT NY WEBSOCKET-SERVER SETUP +++

// Start server with explicit host binding for Fly.io compatibility
server.listen(PORT, HOST, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`Server listening on ${HOST}:${PORT}`);
  
  // Log URLs that show actual hostname, not localhost
  logger.info(`Health check available at http://${HOST}:${PORT}/api`);
  logger.info(`API endpoints available at:`);
  logger.info(`- http://${HOST}:${PORT}/api/analyze`);
  logger.info(`- http://${HOST}:${PORT}/api/video/analyze-video`);
  
  // Log test routes status
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ROUTES === 'true') {
    logger.info(`Test routes available at http://${HOST}:${PORT}/api/test`);
  } else {
    logger.info('Test routes are disabled. Set ENABLE_TEST_ROUTES=true to enable.');
  }
});

// Handle server errors
server.on('error', (error: any) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      logger.error(`Port ${PORT} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`Port ${PORT} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

export { app };