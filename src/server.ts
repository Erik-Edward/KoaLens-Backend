// src/server.ts
console.log("--- Server.ts script starting ---"); 

// Ta bort denna import: import 'module-alias/register';
import express, { RequestHandler } from 'express';
import cors from 'cors';
// Remove Anthropic import
// import { Anthropic } from '@anthropic-ai/sdk'; 
import dotenv from 'dotenv';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, Content } from "@google/generative-ai"; // Import Gemini
// Assume Gemini prompts exist or define them here/import from config
import { GEMINI_ANALYSIS_PROMPT, GEMINI_CROPPED_IMAGE_PROMPT } from '@/config/prompts'; 
import { validateIngredients } from '@/services/veganValidator';
import { compressImage, getBase64Size } from '@/utils/imageProcessor';
import { checkUserLimit, incrementAnalysisCount } from '@/services/supabaseService';
// Importera endast när det behövs i faktisk kod
// import { supabase } from '@/services/supabaseService';
import apiRoutes from './routes';
import { TempFileCleaner } from './utils/tempFileCleaner';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Använd nya API-routes under /api path
app.use('/api', apiRoutes);

// Starta schemalagd rensning av tillfälliga filer
TempFileCleaner.startScheduler();

// Remove Anthropic client
// const anthropic = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY
// });

// Instantiate Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use an appropriate Gemini model

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

interface QualityIssue {
  type: 'BLUR' | 'INCOMPLETE' | 'LIGHTING' | 'UNCERTAINTY';
  message: string;
}

interface StandardError {
  error: 'IMAGE_QUALITY' | 'ANALYSIS_ERROR' | 'IMAGE_MISSING' | 'USAGE_LIMIT_EXCEEDED';
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
const analyzeImage: RequestHandler = async (req, res) => {
  try {
    console.log('Received analyze request (Gemini)');
    const { image, isCroppedImage, userId } = req.body as AnalyzeRequestBody;

    if (!image) {
      console.log('No image provided in request');
      return res.status(400).json({
        error: 'IMAGE_MISSING',
        message: 'Ingen bild hittades',
        details: {
          suggestions: ['Vänligen försök igen']
        }
      } as StandardError);
    }

    // User limit check (keep as is)
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
          return res.status(403).json({
            error: 'USAGE_LIMIT_EXCEEDED',
            message: 'Du har nått din månatliga gräns för analyser.',
            details: {
              analysesUsed: userLimit.analysesUsed,
              analysesLimit: userLimit.analysesLimit,
              isPremium: userLimit.isPremium
            }
          });
        }
      } catch (error) {
        console.error('Error checking user limit:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
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
      throw new Error('Failed to compress image'); // Simplified error
    }

    // Select Gemini prompt
    const analysisPromptText = isCroppedImage ? GEMINI_CROPPED_IMAGE_PROMPT : GEMINI_ANALYSIS_PROMPT;
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
       throw new Error("Ett oväntat svar mottogs från Gemini.");
    }

    const responseContent = result.response.candidates?.[0]?.content;
    if (!responseContent || responseContent.role !== 'model' || !responseContent.parts?.[0]?.text) {
        console.error("Invalid response structure from Gemini:", JSON.stringify(result.response, null, 2));
        // Log safety ratings if present
        if (result.response.promptFeedback?.blockReason) {
             console.error(`Gemini request blocked: ${result.response.promptFeedback.blockReason}`);
             console.error(`Safety Ratings: ${JSON.stringify(result.response.promptFeedback.safetyRatings)}`);
             throw new Error(`Analysen blockerades av säkerhetsskäl: ${result.response.promptFeedback.blockReason}`);
        }
        throw new Error("Kunde inte extrahera text från Gemini-svaret.");
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
          throw new Error("Incomplete JSON structure received from Gemini.");
      }
       // Ensure confidence is a number between 0 and 1
       analysisResult.confidence = Math.max(0, Math.min(1, Number(analysisResult.confidence) || 0));


    } catch (parseError) {
      console.error("Failed to parse JSON response from Gemini:", parseError);
      console.error("Raw text that failed parsing:", geminiRawText);
      // Attempt to handle non-JSON response or provide a generic error
      // Maybe try a simpler prompt if this fails often?
      // For now, throw a user-friendly error.
      throw new Error("Kunde inte tolka analysresultatet från Gemini.");
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
         return res.status(400).json({
             error: 'IMAGE_QUALITY',
             message: 'Bilden behöver vara tydligare för en säker analys.',
             details: { suggestions: ['Försök ta en ny bild med bättre ljus.', 'Se till att hela listan är synlig.'] }
         });
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
        const result = await incrementAnalysisCount(userId);
        console.log('Analysis count incremented:', result);
        
        finalResult.usageUpdated = true;
        finalResult.usageInfo = {
          analysesUsed: result.analysesUsed,
          analysesLimit: result.analysesLimit,
          remaining: result.analysesLimit - result.analysesUsed
        };
      } catch (error) {
        console.error('Failed to increment analysis count:', error);
      }
    }

    console.log('Sending final result (Gemini):', finalResult);
    res.json(finalResult);

  } catch (error) {
    console.error('Error analyzing image (Gemini):', error);
    // TODO: Adapt getUserFriendlyError for Gemini errors (e.g., safety blocks)
    let userMessage = 'Ett fel uppstod vid analysen.';
    if (error instanceof Error) {
        if (error.message.includes("blockReason")) {
            userMessage = "Analysen kunde inte slutföras på grund av innehållsfilter.";
        } else if (error.message.includes("tolka analysresultatet")) {
            userMessage = "Kunde inte förstå svaret från analysmotorn. Försök igen."
        } else {
             userMessage = error.message; // Use specific error if available
        }
    }
     res.status(400).json({ 
         error: 'ANALYSIS_ERROR', 
         message: userMessage 
     });
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
    const { supabase } = await import('@/services/supabaseService');
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

const PORT_STR = process.env.PORT || '8080';
const PORT = parseInt(PORT_STR, 10);

// Explicitly listen on 0.0.0.0 for compatibility with Fly Proxy
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} and host 0.0.0.0`);
  console.log(`Analysis API (Gemini) available at http://localhost:${PORT}/analyze`); // Updated log
});