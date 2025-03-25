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
  isVegan: boolean | null;
  confidence: number;
  productName: string;
  ingredientList: string[];
  nonVeganIngredients: string[];
  reasoning: string;
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

function extractLastJsonFromText(text: string): ClaudeAnalysisResult {
  const jsonMatches = text.match(/\{[\s\S]*?\}/g);
  if (!jsonMatches || jsonMatches.length === 0) {
    throw new Error('Kunde inte hitta JSON-data i svaret');
  }

  const lastJson = jsonMatches[jsonMatches.length - 1];
  try {
    const result = JSON.parse(lastJson) as ClaudeAnalysisResult;
    
    // Ensure we handle the null case properly
    if (result.isVegan === null) {
      result.confidence = Math.min(result.confidence, 0.5);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to parse JSON:', lastJson);
    throw new Error('Kunde inte tolka analysresultatet');
  }
}

// Helper to log potential misreading instances
function logPotentialMisreading(claudeResult: ClaudeAnalysisResult, rawText: string, userId?: string): void {
  // Check for suspicious patterns
  const suspiciousIngredients = claudeResult.ingredientList.some(ingredient => 
    ingredient.includes('(något)') || 
    ingredient.includes('(...)') ||
    ingredient.includes('...') ||
    ingredient.includes('???')
  );
  
  const partialWordPatterns = claudeResult.ingredientList.some(ingredient => {
    // Check for words followed by parentheses indicating partial reading
    return /\w+\s*\([^)]*\)/.test(ingredient) || 
           // Check for short words (likely partial readings)
           (ingredient.length <= 4 && !/salt|mjöl|olja|ris|kli|malt/i.test(ingredient));
  });
  
  const highConfidenceShortList = 
    claudeResult.ingredientList.length < 3 && 
    claudeResult.confidence > 0.9;
  
  const contradictoryResults = 
    (claudeResult.nonVeganIngredients.length > 0 && claudeResult.isVegan === true) ||
    (claudeResult.nonVeganIngredients.length === 0 && claudeResult.isVegan === false);
    
  // Only log if there are suspicious patterns
  if (suspiciousIngredients || partialWordPatterns || highConfidenceShortList || contradictoryResults) {
    // Log to database or analytics service
    console.log('Potential misreading detected', {
      suspiciousIngredients,
      partialWordPatterns,
      highConfidenceShortList,
      contradictoryResults,
      ingredientList: claudeResult.ingredientList,
      nonVeganIngredients: claudeResult.nonVeganIngredients,
      confidence: claudeResult.confidence,
      isVegan: claudeResult.isVegan,
      userId: userId || 'anonymous',
      timestamp: new Date().toISOString()
    });
    
    // Here you would typically send this data to your logging service
    // If you have a real service set up, you could include userId for tracking
    if (process.env.NODE_ENV === 'development') {
      console.log('Raw text from image:', rawText);
    }
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
      'cannot read', "can't read", 'kan inte läsa', 'svår att läsa',
      'completely blurry', 'too blurry', 'för suddig', 'otydlig',
      'illegible', 'oläslig', 'oläsbar'
    ],
    INCOMPLETE: [
      'missing ingredients', 'saknas ingredienser',
      'cut off ingredients', 'avskurna ingredienser',
      'cannot see ingredients', 'kan inte se ingredienserna',
      "can't see ingredients", 'ofullständig lista',
      'incomplete list', 'delvis synlig',
      'endast delvis', 'endast delar'
    ],
    LIGHTING: [
      'too dark', 'för mörk',
      'too bright', 'för ljus',
      'completely obscured', 'helt dold',
      'poor contrast', 'dålig kontrast',
      'dark text on dark background', 'mörk text på mörk bakgrund',
      'contrast', 'kontrast',
      'bakgrunden gör', 'bakgrunden försvårar'
    ]
  };

  const minorIssues = {
    UNCERTAINTY: [
      'difficulty identifying', 'svårt att identifiera',
      'having difficulty', 'kunde inte avgöra',
      'cannot confirm', 'kan inte bekräfta',
      'multilingual', 'flerspråkig',
      'translation variations', 'osäkerhet',
      'uncertainty', 'osäker',
      'language', 'språk',
      'translate', 'översätta',
      'foreign', 'främmande',
      'unfamiliar language', 'okänt språk',
      'partial word', 'delvis ord',
      'partial text', 'delvis text'
    ]
  };

  // Check for specific content issues - partially read text or suspiciously short ingredient lists
  const contentIssues = [
    '(något)', '???', '(...)', '...',
    'could not fully read', 'kunde inte helt läsa',
    'partial text', 'delvis text',
    'partial word', 'delvis ord'
  ];

  // Look for patterns indicating partial word readings in the full text
  const partialWordPattern = /\w+\s*\([^)]*\)/;
  const containsPartialWordPattern = partialWordPattern.test(fullTextLower);

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
        message: 'Ljusförhållandena eller kontrasten gör texten svår att läsa'
      });
    }

    // Check for language-related issues
    if (text.includes('language') || 
        text.includes('språk') || 
        text.includes('translate') || 
        text.includes('översätt') ||
        text.includes('foreign') ||
        text.includes('främmande')) {
      
      hasSevereIssues = true;
      issues.push({
        type: 'UNCERTAINTY',
        message: 'Ingredienslistan är på ett språk som är svårt att analysera säkert'
      });
    }

    // Check for content issues - partially read ingredients
    if (contentIssues.some(phrase => text.includes(phrase)) || containsPartialWordPattern) {
      hasSevereIssues = true;
      issues.push({
        type: 'UNCERTAINTY',
        message: 'Delar av ingredienslistan verkar vara felaktigt eller ofullständigt avlästa'
      });
    }

    if (!hasSevereIssues && minorIssues.UNCERTAINTY.some(phrase => text.includes(phrase))) {
      hasSevereIssues = true;
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
    hasIssues: hasSevereIssues || uniqueIssues.length > 0,
    issues: uniqueIssues
  };
}

function createQualityError(qualityIssues: QualityIssue[]): StandardError {
  // More specific suggestions based on the detected issues
  const commonSuggestions = [
    'Se till att hela ingredienslistan är synlig i bilden',
    'Håll kameran stilla och parallell med texten',
    'Se till att det finns tillräckligt med ljus',
    'Undvik skuggor och reflektioner'
  ];
  
  const specificSuggestions: Record<string, string[]> = {
    'BLUR': [
      'Fokusera kameran på texten innan du tar bilden',
      'Håll telefonen stilla när du tar bilden',
      'Använd beskärningsverktyget för att endast inkludera ingredienslistan'
    ],
    'INCOMPLETE': [
      'Ta en bild som visar hela ingredienslistan',
      'Använd beskärningsverktyget efter att du tagit en bild av hela listan',
      'Se till att inga ord är avklippta i kanten av bilden'
    ],
    'LIGHTING': [
      'Ta bilden i ett väl upplyst område',
      'Undvik direkt blixt som kan reflekteras på förpackningen',
      'Försök att vinkla förpackningen för att minska reflektioner',
      'Om texten har dålig kontrast (mörk text på mörk bakgrund), hitta en ljusare bakgrund'
    ],
    'UNCERTAINTY': [
      'Fokusera specifikt på ingredienslistan, inte hela förpackningen',
      'Om texten är väldigt liten, kom närmare innan du tar bilden',
      'Försök med beskärningsverktyget för att isolera ingredienslistan',
      'Om ingredienslistan är på ett främmande språk, se om det finns en svensk eller engelsk version på förpackningen',
      'Om texten har dålig kontrast, ta bilden från en annan vinkel med bättre ljus',
      'Om möjligt, försök hitta samma produkt med ingredienslista på svenska eller engelska'
    ]
  };
  
  // Check if we have specific issues
  const hasContrastIssue = qualityIssues.some(issue => 
    issue.message.includes('kontrast') || 
    issue.message.toLowerCase().includes('contrast')
  );
  
  const hasLanguageIssue = qualityIssues.some(issue => 
    issue.message.includes('språk') || 
    issue.message.toLowerCase().includes('language')
  );

  const hasMisreadIssue = qualityIssues.some(issue =>
    issue.message.includes('felaktigt avläst') ||
    issue.message.includes('saknas') ||
    issue.message.includes('oklara')
  );
  
  // Add specific suggestions based on detected issues
  const allSuggestions = [...commonSuggestions];
  const issueTypes = new Set(qualityIssues.map(issue => issue.type));
  
  issueTypes.forEach(type => {
    if (specificSuggestions[type]) {
      // Add 1-2 specific suggestions for each issue type
      const typeSpecificSuggestions = specificSuggestions[type];
      
      // For specific issues, include the related suggestions
      let suggestionCount = Math.min(2, typeSpecificSuggestions.length);
      let specificSuggestionIndices: number[] = [];
      
      if (type === 'UNCERTAINTY') {
        if (hasContrastIssue) {
          specificSuggestionIndices.push(4); // Add contrast-specific suggestion
          suggestionCount++;
        }
        
        if (hasLanguageIssue) {
          specificSuggestionIndices.push(3); // Add language-specific suggestion
          suggestionCount++;
        }

        if (hasMisreadIssue) {
          specificSuggestionIndices.push(0, 1); // Add better focus suggestions
          suggestionCount++;
        }
      }
      
      // Add general suggestions for this type if we don't have enough specific ones
      for (let i = 0; specificSuggestionIndices.length < suggestionCount && i < typeSpecificSuggestions.length; i++) {
        if (!specificSuggestionIndices.includes(i)) {
          specificSuggestionIndices.push(i);
        }
      }
      
      // Add all selected suggestions
      specificSuggestionIndices.forEach(index => {
        if (index < typeSpecificSuggestions.length) {
          allSuggestions.push(typeSpecificSuggestions[index]);
        }
      });
    }
  });
  
  // Create appropriate message based on detected issues
  let message = 'Vi behöver en tydligare bild för att kunna göra en säker analys';
  
  if (hasLanguageIssue) {
    message = 'Ingredienslistan på ett främmande språk är svår att analysera säkert';
  } else if (hasContrastIssue) {
    message = 'Textens kontrast mot bakgrunden gör den svår att läsa - försök med bättre ljus';
  } else if (hasMisreadIssue) {
    message = 'Ingredienslistan verkar felaktigt avläst - vi behöver en tydligare bild';
  }
  
  // Limit to 5 suggestions total to avoid overwhelming the user
  const limitedSuggestions = Array.from(new Set(allSuggestions)).slice(0, 5);

  return {
    error: 'IMAGE_QUALITY',
    message: message,
    details: {
      issues: qualityIssues.map(issue => issue.message),
      suggestions: limitedSuggestions
    }
  };
}

function determineVeganStatus(
  claudeResult: ClaudeAnalysisResult, 
  validationResult: { isVegan: boolean | null; confidence: number },
  rawClaudeText: string,
  isCroppedImage: boolean = false
): { isVegan: boolean | null; qualityIssues?: QualityIssue[]; needsBetterImage?: boolean } {
  
  const { hasIssues, issues } = detectImageQualityIssues(claudeResult.reasoning, rawClaudeText);
  
  // Check for unusually short ingredient list which may indicate missing ingredients
  const isIngredientListSuspicious = 
    claudeResult.ingredientList.length < 2 || // Extremely short list
    (claudeResult.ingredientList.length < 3 && claudeResult.confidence > 0.9); // Short list with suspiciously high confidence
  
  // Check for suspicious ingredients that may indicate misreading
  const suspiciousIngredients = claudeResult.ingredientList.some(ingredient => 
    ingredient.includes('(något)') || 
    ingredient.includes('(...)') ||
    ingredient.includes('...') ||
    ingredient.includes('???')
  );
  
  // Check for partial words that may indicate unclear reading
  const partialWordPatterns = claudeResult.ingredientList.some(ingredient => {
    // Check for words followed by parentheses indicating partial reading
    return /\w+\s*\([^)]*\)/.test(ingredient) || 
           // Check for short words (likely partial readings)
           (ingredient.length <= 4 && !/salt|mjöl|olja|ris|kli|malt/i.test(ingredient));
  });
  
  // If there are suspicious patterns that indicate text misreading
  if (isIngredientListSuspicious || suspiciousIngredients || partialWordPatterns) {
    // Add a quality issue about potential misreading
    issues.push({
      type: 'UNCERTAINTY',
      message: 'Ingredienslistan kan vara felaktigt avläst - vissa delar verkar saknas eller vara oklara'
    });
    
    // Lower confidence significantly
    claudeResult.confidence = Math.min(claudeResult.confidence, 0.6);
  }
  
  // If Claude explicitly returned null for isVegan, respect that decision
  if (claudeResult.isVegan === null) {
    return {
      isVegan: null,
      qualityIssues: issues.length > 0 ? issues : [{
        type: 'UNCERTAINTY',
        message: 'Ingredienslistan kan inte analyseras med tillräcklig säkerhet'
      }],
      needsBetterImage: true
    };
  }
  
  // If validation result indicates null (too uncertain), prioritize this
  if (validationResult.isVegan === null) {
    return {
      isVegan: null,
      qualityIssues: [{
        type: 'UNCERTAINTY',
        message: 'Osäker analys av ingredienslistan'
      }],
      needsBetterImage: true
    };
  }
  
  // Kontrollera diskrepans mellan reasoning och isVegan värdet
  const reasoningLower = claudeResult.reasoning.toLowerCase();
  
  // Look for specific Swedish phrases indicating uncertainty
  const indicatesUncertainty = 
    reasoningLower.includes('kunde inte avgöra') || 
    reasoningLower.includes('kunde inte bestämma') || 
    reasoningLower.includes('osäker') || 
    reasoningLower.includes('otydlig') ||
    reasoningLower.includes('kan inte läsa') ||
    reasoningLower.includes('svårt att läsa') ||
    reasoningLower.includes('dålig kontrast') ||
    reasoningLower.includes('mörk bakgrund');
  
  // If there's uncertainty in reasoning OR we detected quality issues OR suspicious ingredients
  if (indicatesUncertainty || hasIssues || isIngredientListSuspicious || suspiciousIngredients || partialWordPatterns) {
    // Set a lower confidence threshold for cropped images as they should be clearer
    const confidenceThreshold = isCroppedImage ? 0.6 : 0.7;
    
    // More aggressive confidence adjustment
    const adjustedConfidence = (suspiciousIngredients || partialWordPatterns) ? 
      Math.min(claudeResult.confidence, 0.5) : 
      claudeResult.confidence;
    
    if (adjustedConfidence < confidenceThreshold) {
      return {
        isVegan: null,
        qualityIssues: issues.length > 0 ? issues : [{
          type: 'UNCERTAINTY',
          message: 'Texten i bilden är inte tillräckligt tydlig för en säker analys'
        }],
        needsBetterImage: true
      };
    }
  }
  
  const indicatesVegan = 
    reasoningLower.includes('är vegansk') || 
    reasoningLower.includes('produkten är vegansk') ||
    (reasoningLower.includes('vegansk') && claudeResult.nonVeganIngredients.length === 0);

  // Om reasoning indikerar vegansk och det inte finns några icke-veganska ingredienser,
  // lita på reasoning snarare än isVegan flaggan
  if (indicatesVegan && claudeResult.nonVeganIngredients.length === 0) {
    return {
      isVegan: true
    };
  }

  // Om vi har motstridiga uppgifter, lita på ingrediensanalysen
  if (claudeResult.nonVeganIngredients.length === 0 && claudeResult.isVegan === false) {
    // Double-check with our local validation and add additional checks
    if (claudeResult.confidence < 0.8 || isIngredientListSuspicious || suspiciousIngredients || partialWordPatterns) {
      // Low confidence and contradictory result - request better image
      return {
        isVegan: null,
        qualityIssues: [{
          type: 'UNCERTAINTY',
          message: 'Osäker analys av ingredienserna'
        }],
        needsBetterImage: true
      };
    }
    return {
      isVegan: validationResult.isVegan
    };
  }

  // If we have non-vegan ingredients but isVegan is true, this is a contradiction
  if (claudeResult.nonVeganIngredients.length > 0 && claudeResult.isVegan === true) {
    // Double-check if the non-vegan ingredient mentions look suspicious
    const suspiciousNonVeganIngredients = claudeResult.nonVeganIngredients.some(ing => 
      ing.includes('(något)') || ing.includes('???') || ing.includes('...') || /\w+\s*\([^)]*\)/.test(ing)
    );
    
    if (suspiciousNonVeganIngredients) {
      return {
        isVegan: null,
        qualityIssues: [{
          type: 'UNCERTAINTY',
          message: 'De icke-veganska ingredienserna kunde inte identifieras med säkerhet'
        }],
        needsBetterImage: true
      };
    }
    
    return {
      isVegan: false // Trust the specific ingredients identified
    };
  }

  // If confidence is very high (>0.95) but we detected suspicious ingredients
  if (claudeResult.confidence > 0.95 && (isIngredientListSuspicious || suspiciousIngredients || partialWordPatterns)) {
    claudeResult.confidence = 0.7; // Force lower confidence
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
        enhanceContrast: true // Aktivera kontrastförbättring
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
      model: "claude-3-7-sonnet-20250219",
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
    
    // Log potentially problematic misreading
    logPotentialMisreading(claudeResult, content.text, userId);

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

    // Check for "kunde inte avgöra" phrases that indicate uncertainty
    if (claudeResult.reasoning && 
        (claudeResult.reasoning.toLowerCase().includes('kunde inte avgöra') ||
         claudeResult.reasoning.toLowerCase().includes('kan inte läsa') ||
         claudeResult.reasoning.toLowerCase().includes('otydlig'))) {
      
      // If the reasoning indicates uncertainty but isVegan isn't null, adjust it
      if (claudeResult.isVegan !== null) {
        console.log('Korrigerar Claude-resultat baserat på osäkerhet i reasoning');
        claudeResult.isVegan = null;
        claudeResult.confidence = Math.min(claudeResult.confidence, 0.5);
      }
    }

    // Justera konfidens baserat på om bilden är beskuren - but not if confidence is already low
    if (isCroppedImage && claudeResult.confidence > 0.7) {
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

    // Only combine non-vegan ingredients if we have a definitive result
    const nonVeganIngredients = veganStatus.isVegan === null 
      ? [] 
      : Array.from(new Set([
          ...claudeResult.nonVeganIngredients,
          ...validationResult.nonVeganIngredients
        ]));

    // Build a reasoning that includes uncertainty information
    let combinedReasoning = claudeResult.reasoning;
    
    // Add validation reasoning if it adds information
    if (validationResult.reasoning && 
        validationResult.reasoning !== 'Alla ingredienser bedöms som veganska.') {
      combinedReasoning += `\n\n${validationResult.reasoning}`;
    }
    
    // For uncertain results, add a clear message
    if (veganStatus.isVegan === null) {
      combinedReasoning = `Kunde inte avgöra om produkten är vegansk med tillräcklig säkerhet. Försök med en tydligare bild.\n\n${combinedReasoning}`;
    }

    const finalResult: IngredientAnalysisResult = {
      isVegan: veganStatus.isVegan,
      confidence: Math.min(claudeResult.confidence, validationResult.confidence),
      allIngredients: claudeResult.ingredientList,
      nonVeganIngredients: nonVeganIngredients,
      reasoning: combinedReasoning
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