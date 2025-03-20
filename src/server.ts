// src/server.ts
// Ta bort denna import: import 'module-alias/register';
import express, { RequestHandler } from 'express';
import cors from 'cors';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { ANALYSIS_PROMPT, CROPPED_IMAGE_PROMPT } from '@/config/prompts';
import { validateIngredients } from '@/services/veganValidator';
import { compressImage, getBase64Size } from '@/utils/imageProcessor';
import { checkUserLimit, incrementAnalysisCount } from '@/services/supabaseService';
// Importera endast när det behövs i faktisk kod
// import { supabase } from '@/services/supabaseService';
import apiRoutes from './routes';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Använd nya API-routes under /api path
app.use('/api', apiRoutes);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface ClaudeAnalysisResult {
  isVegan: boolean;
  confidence: number;
  productName: string;
  ingredientList: string[];
  nonVeganIngredients: string[];
  reasoning: string;
}

interface IngredientAnalysisResult {
  isVegan: boolean;
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

function extractLastJsonFromText(text: string): ClaudeAnalysisResult {
  const jsonMatches = text.match(/\{[\s\S]*?\}/g);
  if (!jsonMatches || jsonMatches.length === 0) {
    throw new Error('Kunde inte hitta JSON-data i svaret');
  }

  const lastJson = jsonMatches[jsonMatches.length - 1];
  try {
    return JSON.parse(lastJson) as ClaudeAnalysisResult;
  } catch (error) {
    console.error('Failed to parse JSON:', lastJson);
    throw new Error('Kunde inte tolka analysresultatet');
  }
}

function detectImageQualityIssues(reasoning: string, fullText: string): { 
  hasIssues: boolean; 
  issues: QualityIssue[] 
} {
  const issues: QualityIssue[] = [];
  const reasoningLower = reasoning.toLowerCase();
  const fullTextLower = fullText.toLowerCase();

  const severeIssues = {
    BLUR: [
      'cannot read', "can't read", 
      'completely blurry', 'too blurry',
      'illegible'
    ],
    INCOMPLETE: [
      'missing ingredients',
      'cut off ingredients',
      'cannot see ingredients',
      "can't see ingredients"
    ],
    LIGHTING: [
      'too dark', 'too bright',
      'completely obscured'
    ]
  };

  const minorIssues = {
    UNCERTAINTY: [
      'difficulty identifying',
      'having difficulty',
      'cannot confirm',
      'multilingual',
      'translation variations'
    ]
  };

  const textToCheck = [reasoningLower, fullTextLower];
  let hasSevereIssues = false;
  
  for (const text of textToCheck) {
    if (severeIssues.BLUR.some(phrase => text.includes(phrase))) {
      hasSevereIssues = true;
      issues.push({
        type: 'BLUR',
        message: 'Bilden är för suddig för att läsa texten'
      });
    }

    if (severeIssues.INCOMPLETE.some(phrase => text.includes(phrase))) {
      hasSevereIssues = true;
      issues.push({
        type: 'INCOMPLETE',
        message: 'Delar av ingredienslistan saknas i bilden'
      });
    }

    if (severeIssues.LIGHTING.some(phrase => text.includes(phrase))) {
      hasSevereIssues = true;
      issues.push({
        type: 'LIGHTING',
        message: 'Ljusförhållandena gör texten oläsbar'
      });
    }

    if (hasSevereIssues && minorIssues.UNCERTAINTY.some(phrase => text.includes(phrase))) {
      issues.push({
        type: 'UNCERTAINTY',
        message: 'Det finns osäkerhet i textavläsningen'
      });
    }
  }

  const uniqueIssues = Array.from(
    new Map(issues.map(issue => [issue.type, issue])).values()
  );

  return {
    hasIssues: hasSevereIssues,
    issues: uniqueIssues
  };
}

function createQualityError(qualityIssues: QualityIssue[]): StandardError {
  const suggestions = [
    'Se till att hela ingredienslistan är synlig i bilden',
    'Håll kameran stilla och parallell med texten',
    'Se till att det finns tillräckligt med ljus',
    'Undvik skuggor och reflektioner'
  ];

  return {
    error: 'IMAGE_QUALITY',
    message: 'Vi behöver en tydligare bild för att kunna göra en säker analys',
    details: {
      issues: qualityIssues.map(issue => issue.message),
      suggestions
    }
  };
}

function determineVeganStatus(
  claudeResult: ClaudeAnalysisResult, 
  validationResult: { isVegan: boolean },
  rawClaudeText: string,
  isCroppedImage: boolean = false
): { isVegan: boolean | null; qualityIssues?: QualityIssue[]; needsBetterImage?: boolean } {
  
  const { hasIssues, issues } = detectImageQualityIssues(claudeResult.reasoning, rawClaudeText);
  
  // Kontrollera diskrepans mellan reasoning och isVegan värdet
  const reasoningLower = claudeResult.reasoning.toLowerCase();
  const indicatesVegan = 
    reasoningLower.includes('fully vegan') || 
    reasoningLower.includes('appears to be vegan') ||
    reasoningLower.includes('all ingredients are') ||
    (reasoningLower.includes('vegan') && claudeResult.nonVeganIngredients.length === 0);

  // Om reasoning indikerar vegansk och det inte finns några icke-veganska ingredienser,
  // lita på reasoning snarare än isVegan flaggan
  if (indicatesVegan && claudeResult.nonVeganIngredients.length === 0) {
    return {
      isVegan: true
    };
  }

  if (hasIssues) {
    const confidenceThreshold = isCroppedImage ? 0.7 : 0.9;
    if (claudeResult.confidence < confidenceThreshold) {
      return {
        isVegan: null,
        qualityIssues: issues,
        needsBetterImage: true
      };
    }
  }

  // Om vi har motstridiga uppgifter, lita på ingrediensanalysen
  if (claudeResult.nonVeganIngredients.length === 0 && !claudeResult.isVegan) {
    return {
      isVegan: validationResult.isVegan
    };
  }

  return {
    isVegan: claudeResult.isVegan && validationResult.isVegan
  };
}

function getUserFriendlyError(error: unknown): StandardError {
  if (error instanceof Error) {
    if (error.message.includes('JSON') || error.message.includes('data i svaret')) {
      return createQualityError([{
        type: 'BLUR',
        message: 'Bilden är otydlig eller svårläst'
      }]);
    }

    if (error.message.includes('compress')) {
      return {
        error: 'ANALYSIS_ERROR',
        message: 'Det gick inte att bearbeta bilden',
        details: {
          suggestions: ['Försök ta en ny bild med bättre ljus']
        }
      };
    }
  }

  return {
    error: 'ANALYSIS_ERROR',
    message: 'Ett fel uppstod. Vänligen försök igen',
    details: {
      suggestions: ['Försök ta en ny bild']
    }
  };
}

const analyzeImage: RequestHandler = async (req, res) => {
  try {
    console.log('Received analyze request');
    const { image, isCroppedImage, userId } = req.body as AnalyzeRequestBody;
    
    if (!image) {
      console.log('No image provided in request');
      res.status(400).json({
        error: 'IMAGE_MISSING',
        message: 'Ingen bild hittades',
        details: {
          suggestions: ['Vänligen försök igen']
        }
      } as StandardError);
      return;
    }

    // Om userId tillhandahålls, kontrollera användningsgränsen
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
          res.status(403).json({
            error: 'USAGE_LIMIT_EXCEEDED',
            message: 'Du har nått din månatliga gräns för analyser.',
            details: {
              analysesUsed: userLimit.analysesUsed,
              analysesLimit: userLimit.analysesLimit,
              isPremium: userLimit.isPremium
            }
          });
          return;
        }
      } catch (error) {
        console.error('Error checking user limit:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      }
    } else {
      console.warn('No user ID provided in analysis request');
    }
    
    console.log('Processing image...', {
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
      });
      const compressedSize = getBase64Size(base64Data);
      console.log(`Compressed image size: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
    } catch (compressionError) {
      console.error('Error during image compression:', compressionError);
      throw new Error('Failed to compress image to acceptable size');
    }

    // Välj rätt prompt baserat på om bilden är beskuren eller inte
    const analysisPrompt = isCroppedImage ? CROPPED_IMAGE_PROMPT : ANALYSIS_PROMPT;
    console.log('Using prompt for', isCroppedImage ? 'cropped' : 'uncropped', 'image');

    console.log('Sending request to Claude...');
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64Data,
            },
          },
          {
            type: "text",
            text: analysisPrompt
          }
        ],
      }],
    });

    console.log('Received response from Claude');
    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error("Ett oväntat svar mottogs från analysmotorn");
    }

    console.log('Raw response from Claude:', content.text);

    const claudeResult = extractLastJsonFromText(content.text);
    console.log('Parsed Claude result:', claudeResult);

    // VIKTIGT: Korrigera motstridiga Claude-resultat
    if (claudeResult.reasoning && 
        claudeResult.reasoning.toLowerCase().includes('vegansk') && 
        claudeResult.nonVeganIngredients.length === 0) {
      
      const reasoningIndicatesVegan = 
        claudeResult.reasoning.toLowerCase().includes('är vegansk') || 
        claudeResult.reasoning.toLowerCase().includes('produkten är vegansk');
      
      // Om reasoning indikerar vegansk men isVegan är false, korrigera
      if (reasoningIndicatesVegan && claudeResult.isVegan === false) {
        console.log('Korrigerar motstridigt Claude-resultat: reasoning säger vegansk men isVegan är false');
        claudeResult.isVegan = true;
        claudeResult.confidence = Math.max(claudeResult.confidence, 0.9); // Säkerställ hög confidence
      }
    }

    // Justera konfidens baserat på om bilden är beskuren
    if (isCroppedImage) {
      claudeResult.confidence = Math.min(1, claudeResult.confidence + 0.1);
    }

    const validationResult = validateIngredients(claudeResult.ingredientList);
    console.log('Local validation result:', validationResult);

    // Justera kvalitetskontroll för beskurna bilder
    const veganStatus = determineVeganStatus(
      claudeResult, 
      validationResult, 
      content.text,
      isCroppedImage
    );
    
    if (veganStatus.needsBetterImage) {
      res.status(400).json(createQualityError(veganStatus.qualityIssues || [{
        type: 'UNCERTAINTY',
        message: isCroppedImage ? 
          'Texten i bilden är otydlig. Försök ta en ny bild med bättre ljus.' :
          'Bilden behöver vara tydligare för en säker analys'
      }]));
      return;
    }

    const combinedNonVeganIngredients = new Set([
      ...claudeResult.nonVeganIngredients,
      ...validationResult.nonVeganIngredients
    ]);

    const finalResult: IngredientAnalysisResult = {
      isVegan: veganStatus.isVegan ?? false,
      confidence: Math.min(claudeResult.confidence, validationResult.confidence),
      allIngredients: claudeResult.ingredientList,
      nonVeganIngredients: Array.from(combinedNonVeganIngredients),
      reasoning: `${claudeResult.reasoning}\n\n${validationResult.reasoning}`
    };

    // Efter lyckad analys, öka användningsantalet om userId tillhandahålls
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
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
        // Continue with response even if tracking fails
      }
    }

    console.log('Sending final result:', finalResult);
    res.json(finalResult);

  } catch (error) {
    console.error('Error analyzing image:', error);
    const userError = getUserFriendlyError(error);
    res.status(400).json(userError);
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});