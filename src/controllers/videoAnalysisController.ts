export const analyzeVideo = async (req: Request, res: Response) => {
  try {
    // ... existing code ...

    // Logga analysslutet
    logger.info('Video analysis completed by controller', {
      ingredientCount: result.ingredients?.length || 0,
      isVegan: result.isVegan,
      confidence: result.confidence
    });

    // Logga exakt vad som skickas till frontend (viktigt för felsökning)
    logger.info('Sending response payload to client', {
      responsePayload: JSON.stringify(result),
      payloadSize: JSON.stringify(result).length
    });

    // Skicka resultat till klienten
    return res.status(200).json(result);
  } catch (error: any) {
    // ... existing code ...
  }
}; 