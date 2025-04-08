import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import videoAnalysisService from '../services/videoAnalysisService';

// Define request type locally if not imported
interface MediaAnalysisRequest {
  base64Data: string;
  mimeType: string;
  preferredLanguage?: string;
  requestId?: string;
}

export const analyzeVideo = async (_req: Request, res: Response): Promise<Response> => { // Added return type
  const startTime = Date.now(); // Track start time
  try {
    const { base64Data, mimeType, preferredLanguage, requestId } = _req.body as MediaAnalysisRequest;

    // Validate required fields (redundant if done in routes/index or middleware, but safe to keep)
    if (!base64Data || !mimeType) {
      logger.warn('Missing base64Data or mimeType in videoAnalysisController');
      return res.status(400).json({ success: false, error: 'Missing required fields: base64Data, mimeType' });
    }

    // Logga mottagen request
    logger.info('Processing video analysis request in controller', {
      mimeType,
      preferredLanguage: preferredLanguage || 'sv',
      requestId: requestId || 'not-provided',
      dataSize: base64Data.length
    });

    // Anropa service för att utföra analysen
    const result = await videoAnalysisService.analyzeVideo(
      base64Data,
      mimeType,
      preferredLanguage || 'sv' // Default to Swedish if not provided
    );

    const processingTimeMs = Date.now() - startTime;

    // Logga analysslutet
    logger.info('Video analysis completed by controller', {
      ingredientCount: result.ingredients?.length || 0,
      isVegan: result.isVegan,
      confidence: result.confidence,
      processingTimeMs
    });

    // Logga exakt vad som skickas till frontend (viktigt för felsökning)
    // Limit payload log size for performance
    const responsePayloadString = JSON.stringify(result);
    logger.info('Sending response payload to client', {
      payloadSize: responsePayloadString.length,
      payloadExcerpt: responsePayloadString.substring(0, 200) + (responsePayloadString.length > 200 ? '...' : '') // Log only excerpt
    });

    // Skicka resultat till klienten
    return res.status(200).json(result);

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime;
    logger.error('Error in video analysis controller', { 
      error: error.message, 
      stack: error.stack?.substring(0, 300), // Log truncated stack 
      processingTimeMs 
    });
    // Skicka fel-respons
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}; 