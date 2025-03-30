import * as winston from 'winston';

// Om logger redan är definierad i en annan fil, importera den här
// Annars använd denna implementering
let logger: winston.Logger;

try {
  // Försök att importera logger från logger.js, som verkar vara vår huvudlogger
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  logger = require('./logger').logger;
} catch (e) {
  // Om import misslyckas, skapa en ny logger
  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'koalens-backend' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' })
    ]
  });
}

/**
 * Log video analysis request details
 * @param details Details about the video analysis request
 */
export function logVideoAnalysisRequest(details: {
  requestId?: string;
  mimeType: string;
  preferredLanguage?: string;
  dataSize: number;
  clientInfo?: Record<string, any>;
}) {
  logger.info('Video analysis request received', {
    service: 'videoAnalysis',
    operation: 'request',
    requestId: details.requestId || 'not-provided',
    mimeType: details.mimeType,
    preferredLanguage: details.preferredLanguage || 'sv',
    dataSizeBytes: details.dataSize,
    timestamp: new Date().toISOString(),
    clientInfo: details.clientInfo || {}
  });
}

/**
 * Log video analysis response details
 * @param details Details about the video analysis response
 */
export function logVideoAnalysisResponse(details: {
  requestId?: string;
  processingTimeSec: number;
  ingredientCount: number;
  isVegan: boolean;
  confidenceScore: number;
  detectedLanguages?: string[];
  statusCode: number;
  errorMessage?: string;
}) {
  const logLevel = details.errorMessage ? 'error' : 'info';
  const operation = details.errorMessage ? 'response:error' : 'response:success';
  
  logger[logLevel]('Video analysis completed', {
    service: 'videoAnalysis',
    operation,
    requestId: details.requestId || 'not-provided',
    processingTimeSec: details.processingTimeSec,
    ingredientCount: details.ingredientCount,
    isVegan: details.isVegan,
    confidenceScore: details.confidenceScore,
    detectedLanguages: details.detectedLanguages || [],
    statusCode: details.statusCode,
    timestamp: new Date().toISOString(),
    errorMessage: details.errorMessage
  });
}

/**
 * Log ingredient correction events
 * @param details Details about the ingredient correction
 */
export function logIngredientCorrection(details: {
  ingredient: string;
  originalStatus: boolean;
  correctedStatus: boolean;
  reason: string;
  confidence: number;
}) {
  logger.info('Ingredient classification corrected', {
    service: 'videoAnalysis',
    operation: 'ingredientCorrection',
    ingredient: details.ingredient,
    originalStatus: details.originalStatus,
    correctedStatus: details.correctedStatus,
    reason: details.reason,
    confidence: details.confidence,
    timestamp: new Date().toISOString()
  });
} 