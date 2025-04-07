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
import { compressImage, getBase64Size } from './utils/imageProcessor';
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
app.options('*', (req, res) => {
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

// Använd nya API-routes under /api path
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
  confidence: number;
  productName: string;
  ingredientList: string[];
  nonVeganIngredients: string[];
  reasoning: string;
  // Add fields Gemini might return or remove unused ones
}

interface IngredientAnalysisResult {
  isVegan: boolean | null;
  confidence: number;
  nonVeganIngredients: string[];
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

// --- REFACTOR analyzeImage function ---
const analyzeImage = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    console.log('Received analyze request (Gemini)');
    const { image, isCroppedImage, userId } = req.body as AnalyzeRequestBody;

    if (!image) {
      // Use return to stop execution, but the error is now handled by middleware
      // We could potentially create a custom error type here
      const err = new Error('Ingen bild hittades');
      (err as any).status = 400; // Add status for error handler
      (err as any).errorCode = 'IMAGE_MISSING';
      return next(err); 
    }

    if (userId) {
      console.log('Checking usage limit for user:', userId);
      try {
        const userLimit = await checkUserLimit(userId);
        console.log('User limit check result:', {
          userId, 
          analysesUsed: userLimit.analysesUsed, 
          analysesLimit: userLimit.analysesLimit, 
          hasRemainingAnalyses: userLimit.hasRemainingAnalyses,
          isPremium: userLimit.isPremium
        });
        
        if (!userLimit.hasRemainingAnalyses) {
          console.log('User has reached usage limit:', userId);
          const err = new Error('Du har nått din månatliga gräns för analyser.');
          (err as any).status = 403;
          (err as any).errorCode = 'USAGE_LIMIT_EXCEEDED';
          (err as any).details = {
            analysesUsed: userLimit.analysesUsed,
            analysesLimit: userLimit.analysesLimit,
            isPremium: userLimit.isPremium
          };
          return next(err); // Pass error to middleware
        }
      } catch (error) {
        console.error('Error checking user limit:', error);
        // Pass error to middleware instead of sending response
        const err = new Error('Kunde inte verifiera användargräns.');
        (err as any).status = 500;
        (err as any).originalError = error;
        return next(err); 
      }
    } else {
      console.warn('No user ID provided in analysis request');
    }

    console.log('Processing image (Gemini)...', {
      isCropped: isCroppedImage,
      hasUserId: !!userId
    });
    
    let base64Data: string;
    if (image.startsWith('data:image')) {
      base64Data = image.split(',')[1];
    } else {
      base64Data = image;
    }

    const initialSize = getBase64Size(base64Data);
    console.log(`Initial image size: ${(initialSize / 1024 / 1024).toFixed(2)}MB`);

    console.log('Compressing image...');
    try {
      base64Data = await compressImage(base64Data, {
        quality: isCroppedImage ? 1 : 0.8, // Högre kvalitet för beskurna bilder
        maxWidth: isCroppedImage ? 2000 : 1500,
        maxHeight: isCroppedImage ? 2000 : 1500,
        enhanceContrast: true // Aktivera kontrastförbättring
      });
      const compressedSize = getBase64Size(base64Data);
      console.log(`Compressed image size: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
    } catch (compressionError) {
      console.error('Error during image compression:', compressionError);
       const err = new Error('Bildkomprimering misslyckades.');
       (err as any).status = 500;
       (err as any).originalError = compressionError;
       return next(err); // Pass error to middleware
    }

    // Select Gemini prompt
    const analysisPromptText = isCroppedImage ? CROPPED_IMAGE_PROMPT : ANALYSIS_PROMPT;
    console.log('Using Gemini prompt for', isCroppedImage ? 'cropped' : 'uncropped', 'image');

    // --- Gemini API Call ---
    console.log('Sending request to Gemini...');
    
    const parts = [
      { text: analysisPromptText },
      {
        inlineData: {
          mimeType: "image/jpeg", // Assuming JPEG after compression
          data: base64Data
        }
      },
    ];

    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig,
      safetySettings,
    });

    console.log('Received response from Gemini');
    
    // --- Gemini Response Handling ---
    if (!result.response) {
       console.error("Gemini response was empty or undefined.");
       const err = new Error('Ett oväntat svar mottogs från Gemini.');
       (err as any).status = 500;
       return next(err); // Pass error to middleware
    }

    const responseContent = result.response.candidates?.[0]?.content;
    if (!responseContent || responseContent.role !== 'model' || !responseContent.parts?.[0]?.text) {
        console.error("Invalid response structure from Gemini:", JSON.stringify(result.response, null, 2));
        if (result.response.promptFeedback?.blockReason) {
             console.error(`Gemini request blocked: ${result.response.promptFeedback.blockReason}`);
             const err = new Error(`Analysen blockerades av säkerhetsskäl: ${result.response.promptFeedback.blockReason}`);
             (err as any).status = 400;
             (err as any).errorCode = 'ANALYSIS_BLOCKED'; // More specific code
             return next(err); // Pass error to middleware
        }
        const err = new Error('Kunde inte extrahera text från Gemini-svaret.');
        (err as any).status = 500;
        return next(err); // Pass error to middleware
    }

    const geminiRawText = responseContent.parts[0].text;
    console.log('Raw Gemini response text:', geminiRawText);

    let analysisResult: GeminiAnalysisResult;
    try {
      // Gemini should return JSON directly because of responseMimeType
      analysisResult = JSON.parse(geminiRawText) as GeminiAnalysisResult;
       // Basic validation of the parsed result
      if (typeof analysisResult.isVegan === 'undefined' || 
          typeof analysisResult.confidence === 'undefined' ||
          !analysisResult.ingredientList) {
          const err = new Error('Ofullständigt JSON-svar från Gemini.');
          (err as any).status = 500;
          return next(err); // Pass error to middleware
      }
       // Ensure confidence is a number between 0 and 1
       analysisResult.confidence = Math.max(0, Math.min(1, Number(analysisResult.confidence) || 0));


    } catch (parseError) {
      console.error("Failed to parse JSON response from Gemini:", parseError);
      console.error("Raw text that failed parsing:", geminiRawText);
      // Attempt to handle non-JSON response or provide a generic error
      // Maybe try a simpler prompt if this fails often?
      // For now, throw a user-friendly error.
      const err = new Error('Kunde inte tolka analysresultatet från Gemini.');
      (err as any).status = 500;
      (err as any).originalError = parseError;
      return next(err); // Pass error to middleware
    }
    
    console.log('Parsed Gemini result:', analysisResult);

    // --- Validation and Final Result Logic (Needs Adaptation) ---
    // This part needs significant review/adaptation based on how Gemini's 
    // 'reasoning', 'confidence', and quality indicators work compared to Claude.
    
    // TODO: Adapt logPotentialMisreading for Gemini if needed.
    // TODO: Adapt detectImageQualityIssues based on Gemini's reasoning/output.
    // TODO: Adapt determineVeganStatus logic for Gemini's confidence/reasoning.
    
    const validationResult = validateIngredients(analysisResult.ingredientList);
    console.log('Local validation result:', validationResult);

    // Example simplified status determination (replace with adapted logic)
    const finalVeganStatus = analysisResult.isVegan === null ? null : (analysisResult.isVegan && validationResult.isVegan);
    
    // Check quality based on Gemini reasoning (example, needs refinement)
     const reasoningLower = analysisResult.reasoning?.toLowerCase() || "";
     const lowQualityKeywords = ['cannot read', 'blurry', 'unclear', 'cut off', 'incomplete', 'kan inte läsa', 'suddig', 'oklar', 'avklippt', 'ofullständig'];
     const needsBetterImage = lowQualityKeywords.some(kw => reasoningLower.includes(kw)) || analysisResult.confidence < 0.6; // Example threshold

    if (needsBetterImage && finalVeganStatus !== false) { // Don't ask for better image if definitely non-vegan
         console.log("Requesting better image based on Gemini reasoning/confidence");
         // TODO: Create a more nuanced Quality Error based on Gemini's reasoning
         const err = new Error('Bilden behöver vara tydligare för en säker analys.');
         (err as any).status = 400;
         (err as any).errorCode = 'IMAGE_QUALITY';
         (err as any).details = { suggestions: ['Försök ta en ny bild med bättre ljus.', 'Se till att hela listan är synlig.'] };
         return next(err); // Pass error to middleware
    }

    const nonVeganIngredients = finalVeganStatus === null 
      ? [] 
      : Array.from(new Set([
          ...(analysisResult.nonVeganIngredients || []), // Handle potentially missing field
          ...validationResult.nonVeganIngredients
        ]));

    const finalResult: IngredientAnalysisResult = {
      isVegan: finalVeganStatus,
      confidence: Math.min(analysisResult.confidence, validationResult.confidence),
      allIngredients: analysisResult.ingredientList,
      nonVeganIngredients: nonVeganIngredients,
      reasoning: analysisResult.reasoning || "Ingen detaljerad motivering angavs." // Provide default
    };

    // Increment usage count (keep as is)
    if (userId) {
      try {
        console.log('Incrementing analysis count for user:', userId);
        const countResult = await incrementAnalysisCount(userId);
        console.log('Analysis count incremented:', countResult);
        
        finalResult.usageUpdated = true;
        finalResult.usageInfo = {
          analysesUsed: countResult.analysesUsed,
          analysesLimit: countResult.analysesLimit,
          remaining: countResult.analysesLimit - countResult.analysesUsed
        };
      } catch (error) {
        console.error('Failed to increment analysis count:', error);
        // Log error but don't fail the request just for this
      }
    }

    console.log('Sending final result (Gemini):', finalResult);
    res.json(finalResult);

  } catch (error) {
    // --- Outer Catch Block --- 
    console.error('Error analyzing image (Gemini) - Outer catch:', error);
    // Pass any unexpected errors to the middleware
    next(error); 
  }
};

app.post('/analyze', analyzeImage);

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

// Import http module
const http = require('http');

// Create HTTP server explicitly 
const server = http.createServer(app);

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