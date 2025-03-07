// src/server.ts
import 'module-alias/register';
import express, { RequestHandler } from 'express';
import cors from 'cors';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { ANALYSIS_PROMPT, CROPPED_IMAGE_PROMPT } from '@/config/prompts';
import { validateIngredients } from '@/services/veganValidator';
import { compressImage, getBase64Size } from '@/utils/imageProcessor';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
}

interface QualityIssue {
  type: 'BLUR' | 'INCOMPLETE' | 'LIGHTING' | 'UNCERTAINTY';
  message: string;
}

interface StandardError {
  error: 'IMAGE_QUALITY' | 'ANALYSIS_ERROR' | 'IMAGE_MISSING';
  message: string;
  details?: {
    issues?: string[];
    suggestions?: string[];
  };
}

interface AnalyzeRequestBody {
  image: string;
  isOfflineAnalysis?: boolean;
  isCroppedImage?: boolean;
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
    const { image, isCroppedImage } = req.body as AnalyzeRequestBody;
    
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

    console.log('Processing image...', {
      isCropped: isCroppedImage
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

    console.log('Sending final result:', finalResult);
    res.json(finalResult);

  } catch (error) {
    console.error('Error analyzing image:', error);
    const userError = getUserFriendlyError(error);
    res.status(400).json(userError);
  }
};

app.post('/analyze', analyzeImage);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});