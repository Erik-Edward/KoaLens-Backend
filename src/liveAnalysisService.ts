import WebSocket from 'ws';
import { logger } from '../utils/logger';
import config from '../config/ai-config'; // Assuming config holds API key etc.
import { validateIngredients, ValidationResult } from '../services/veganValidator'; // Import validator
import { checkUserLimit, incrementAnalysisCount } from '../services/supabaseService'; // Import Supabase functions
// import { checkUserLimit, incrementAnalysisCount } from './supabaseService'; // Import later when needed

// TODO: Define necessary types for session state, Google API messages, client messages
interface LiveAnalysisSessionState {
  userId: string | null; // User ID for usage tracking
  usageCheckOk: boolean; // Has the usage check passed?
  googleApiConnected: boolean;
  googleApiWebSocket?: WebSocket;
  accumulatedIngredients: Set<string>;
  // currentVeganStatus: boolean | null; // Replaced by validationResult
  validationResult: ValidationResult | null; // Store the full validation result
  lastSentResultString: string; // To compare results before sending updates
  clientReadyToSendConfirmation: boolean; // Flag to track client init completion
  accumulatedResponseJsonString: string; // To accumulate streamed JSON response
  // Add more state properties as needed (e.g., userId, usage count)
}

export class LiveAnalysisService {
  private clientWs: WebSocket;
  private state: LiveAnalysisSessionState;
  private googleLiveApiUrl: string = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'; // Confirmed v1beta URL

  constructor(clientWs: WebSocket) {
    this.clientWs = clientWs;
    this.state = {
      userId: null,
      usageCheckOk: false,
      googleApiConnected: false,
      accumulatedIngredients: new Set(),
      // currentVeganStatus: null, // Replaced
      validationResult: null,
      lastSentResultString: '',
      clientReadyToSendConfirmation: false, // Initialize flag
      accumulatedResponseJsonString: '' // Initialize accumulator
    };

    logger.info('New LiveAnalysisService instance created.');
    this.initializeSession();
  }

  private initializeSession(): void {
    this.setupClientListeners();
    this.connectToGoogleLiveApi();
    // TODO: Add initial usage check with supabaseService?
  }

  private setupClientListeners(): void {
    this.clientWs.on('message', async (message: Buffer) => { // Make async to handle await for usage check
      // First message should be initialization with userId
      if (!this.state.userId) {
        try {
          const initMessage = JSON.parse(message.toString('utf-8'));
          if (initMessage.type === 'init' && initMessage.userId) {
            this.state.userId = initMessage.userId;
            logger.info(`Received init from userId: ${this.state.userId}`);
            // Perform usage check and increment
            const usageOk = await this.handleUsageLimit();
            if (!usageOk) {
              return; // Stop processing if usage limit exceeded
            }
            // Set the flag, but DO NOT send confirmation yet
            this.state.clientReadyToSendConfirmation = true;
            logger.debug('Client init complete and usage confirmed. Ready flag set.');
          } else {
            logger.warn('First message was not valid init message. Closing connection.');
            this.clientWs.close(1008, 'Invalid initialization');
            this.cleanup();
          }
        } catch (error) {
          logger.error('Error parsing init message:', error);
          this.clientWs.close(1008, 'Invalid initialization format');
          this.cleanup();
        }
        return; // Don't process init message as a frame
      }

      // If userId is set and usage check passed, handle as image frame
      if (this.state.usageCheckOk) {
        this.handleClientFrame(message);
      } else {
        // Should ideally not happen if init logic is correct, but log just in case
        logger.warn(`Received frame from userId: ${this.state.userId} before usage check passed. Ignoring.`);
      }
    });

    this.clientWs.on('close', () => {
      logger.info('Client WebSocket closed. Cleaning up LiveAnalysisService.');
      this.cleanup();
    });

    this.clientWs.on('error', (error) => {
      logger.error('Client WebSocket error:', error);
      this.cleanup();
    });
  }

  private async connectToGoogleLiveApi(): Promise<void> {
    // Needs API Key from config
    const apiKey = config.gemini.apiKey;
    if (!apiKey) {
        logger.error('Missing Gemini API Key for Live API connection.');
        this.clientWs.close(1011, 'Internal configuration error');
        return;
    }
    
    // Construct the URL (without query parameters)
    // const targetUrl = `${this.googleLiveApiUrl}?key=${apiKey}`; // OLD: Key in query param
    const targetUrl = this.googleLiveApiUrl; 

    logger.info(`Attempting to connect to Google Live API: ${this.googleLiveApiUrl}`);
    
    // Use 'ws' library to create a client connection with API key in header
    const googleWs = new WebSocket(targetUrl, {
        headers: {
            'x-goog-api-key': apiKey
        }
    });

    googleWs.on('open', () => {
      logger.info('Successfully connected to Google Live API.');
      this.state.googleApiConnected = true;
      this.state.googleApiWebSocket = googleWs;
      
      // Send initial configuration message with top-level "setup" field
      // Updated system instruction to be VERY strict about JSON output format
      const systemInstructionText = `Du är en expert på att analysera bilder av ingredienslistor. Ditt ENDA syfte är att extrahera ALLA identifierade ingredienser från bilden. Svara ALLTID och ENDAST med ett JSON-objekt som har en enda nyckel "ingredients" vars värde är en array av strängar som representerar de identifierade ingredienserna. Inkludera absolut INGEN annan text, förklaringar eller konversation före eller efter JSON-objektet. Om inga ingredienser hittas eller om bilden är oläslig, svara med en tom array: {"ingredients": []}. Exempel på korrekt svar: {"ingredients": ["vetemjöl", "socker", "salt", "vatten", "jäst"]}. Exempel på korrekt svar vid inga ingredienser: {"ingredients": []}. Svara ALDRIG med vanlig text.`;
      
      const initialConfig = {
        setup: { // Correct structure with "setup"
          model: "models/gemini-2.0-flash-live-001", // Specify the model here
          generationConfig: {
             responseModalities: ["TEXT"]
          },
          // Add system instruction
          systemInstruction: { 
            // role: "system", // Role might be implicit for systemInstruction
            parts: [{ text: systemInstructionText }]
          }
        }
      };
      try {
        googleWs.send(JSON.stringify(initialConfig));
        logger.info('Sent initial configuration to Google Live API.');

        // --- NEW: Check if client is waiting and send confirmation NOW --- 
        if (this.state.clientReadyToSendConfirmation && this.clientWs.readyState === WebSocket.OPEN) {
             logger.info('Google API ready and client has initialized. Sending confirmation to client.');
             this.clientWs.send(JSON.stringify({ type: 'status', message: 'Initialization successful, usage confirmed.' }));
        } else if (this.clientWs.readyState !== WebSocket.OPEN) {
             logger.warn('Google API ready, but client WebSocket is not open. Cannot send confirmation.');
        } else {
             // Client hasn't sent init yet, confirmation will be sent when clientReadyToSendConfirmation is set (if needed, but current logic handles it)
             logger.debug('Google API ready, but client has not sent init message yet.');
        }
        // --- END NEW --- 

      } catch (error) {
        logger.error('Failed to send initial config to Google Live API:', error);
        this.cleanup(); // Clean up if initial config fails
      }
    });

    googleWs.on('message', (data: Buffer) => {
      this.handleGoogleResponse(data);
    });

    googleWs.on('close', (code, reason) => {
      logger.info(`Google Live API connection closed. Code: ${code}, Reason: ${reason.toString()}`);
      this.state.googleApiConnected = false;
      this.state.googleApiWebSocket = undefined;
      // Attempt to reconnect or notify client? Depends on requirements.
      if (this.clientWs.readyState === WebSocket.OPEN) {
        this.clientWs.send(JSON.stringify({ type: 'error', message: 'Live analysis connection lost.' }));
        // Optionally close client connection: this.clientWs.close();
      }
    });

    googleWs.on('error', (error) => {
      logger.error('Google Live API WebSocket error:', error);
      this.state.googleApiConnected = false;
      this.state.googleApiWebSocket = undefined;
      if (this.clientWs.readyState === WebSocket.OPEN) {
        this.clientWs.send(JSON.stringify({ type: 'error', message: 'Error connecting to live analysis service.' }));
        // Optionally close client connection: this.clientWs.close();
      }
      this.cleanup(); // Clean up the session on Google WS error
    });
  }

  private handleClientFrame(frameData: Buffer): void {
    // Add check for usageCheckOk
    if (!this.state.usageCheckOk) {
      logger.warn('handleClientFrame called before usage check passed. Ignoring frame.');
      return;
    }

    if (!this.state.googleApiConnected || !this.state.googleApiWebSocket) {
      logger.warn('Received frame from client, but Google API is not connected.');
      // Optionally notify client or buffer frames?
      return;
    }

    // TODO: Verify frame format (is it just base64 string? wrapped in JSON?)
    // Assuming it's base64 jpeg data based on requirements
    try {
        // Construct the message payload for Google Live API
        // Trying structure from docs: clientContent -> turns -> parts -> inlineData
        const payload = JSON.stringify({
            clientContent: { 
              turns: [
                {
                  role: "user", 
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/jpeg",
                        data: frameData.toString('utf-8') // Use actual frameData (assuming it IS base64)
                      }
                    }
                  ]
                }
              ],
              turnComplete: true // Indicate this part is complete for now
            }
        });
        
        this.state.googleApiWebSocket.send(payload);
        logger.debug('Sent frame to Google Live API using client data.');
    } catch (error) {
        logger.error('Failed to process/send frame to Google:', error);
    }
  }

  private handleGoogleResponse(responseData: Buffer): void {
    let responseJson: any;
    try {
        responseJson = JSON.parse(responseData.toString('utf-8'));
        logger.debug('Received raw chunk from Google Live API:', responseJson); // Log the raw chunk

        // --- Ignore setupComplete message --- 
        if (typeof responseJson === 'object' && responseJson !== null && typeof responseJson.setupComplete === 'object') {
            logger.info('Received setupComplete from Google. Ignoring.');
            return; // Ignore this specific message
        }
        // --- End ignore setupComplete ---

        // --- Check for explicit errors from Google --- 
        if (typeof responseJson === 'object' && responseJson !== null && responseJson.error) {
            logger.error('Google Live API returned an error:', responseJson.error);
            // Send error details to the client
            if (this.clientWs.readyState === WebSocket.OPEN) {
                this.clientWs.send(JSON.stringify({
                    type: 'error',
                    error: 'GOOGLE_API_ERROR',
                    message: responseJson.error.message || 'An error occurred during Google analysis.',
                    details: responseJson.error // Forward the whole error object if available
                }));
            }
            this.state.accumulatedResponseJsonString = ''; // Clear accumulator on error
            return; // Stop processing this message
        }
        // --- End error check ---

        let textChunk = '';
        let generationComplete = false;
        let turnComplete = false;

        // Extract text chunk and completion status from the potentially complex structure
        if (responseJson?.serverContent?.modelTurn?.parts?.[0]?.text) {
            textChunk = responseJson.serverContent.modelTurn.parts[0].text;
        }
        if (responseJson?.serverContent?.generationComplete === true) {
            generationComplete = true;
        }
        if (responseJson?.serverContent?.turnComplete === true) {
            turnComplete = true;
        }

        // Append text chunk if present
        if (textChunk) {
            this.state.accumulatedResponseJsonString += textChunk;
            logger.debug(`Appended chunk. Accumulated: "${this.state.accumulatedResponseJsonString}"`);
        }

        // If generation or turn is complete, try to parse the accumulated string
        if (generationComplete || turnComplete) {
            logger.info(`Turn/Generation complete signal received. Attempting to parse accumulated JSON: "${this.state.accumulatedResponseJsonString}"`);
            
            const accumulatedJsonString = this.state.accumulatedResponseJsonString;
            this.state.accumulatedResponseJsonString = ''; // Reset accumulator regardless of parse success

            if (!accumulatedJsonString.trim()) {
                logger.warn('Accumulated JSON string was empty after completion signal.');
                return;
            }

            try {
                const finalJson = JSON.parse(accumulatedJsonString);
                logger.info('Successfully parsed accumulated JSON:', finalJson);

                // Validate the expected structure based on system instruction
                if (typeof finalJson === 'object' && 
                    finalJson !== null && 
                    Array.isArray(finalJson.ingredients)) {
                    
                    const ingredients: string[] = finalJson.ingredients;
                    let ingredientsChanged = false;
                    
                    // --- Process ingredients (same logic as before) --- 
                    ingredients.forEach((ing: unknown) => { 
                        if (typeof ing === 'string' && ing.trim().length > 0 && !this.state.accumulatedIngredients.has(ing.trim())) {
                            this.state.accumulatedIngredients.add(ing.trim());
                            ingredientsChanged = true;
                        }
                    });

                    if (ingredientsChanged) {
                        const currentIngredientsArray = Array.from(this.state.accumulatedIngredients);
                        const newValidationResult = validateIngredients(currentIngredientsArray);
                        
                        const newResultString = JSON.stringify({ 
                            isVegan: newValidationResult.isVegan,
                            nonVegan: newValidationResult.nonVeganIngredients,
                            uncertain: newValidationResult.uncertainIngredients
                        });

                        if (newResultString !== this.state.lastSentResultString) {
                            this.state.validationResult = newValidationResult;
                            this.state.lastSentResultString = newResultString;
                            logger.info(`Ingredients/Status updated: ${newResultString}`);
                            this.sendUpdateToClient(); 
                        }
                    } // --- End ingredient processing ---

                } else {
                    // Log if the FINAL parsed JSON structure is not as expected
                    logger.warn('Final accumulated JSON format mismatch. Expected { ingredients: [...] }, got:', finalJson);
                }

            } catch (parseError) {
                logger.error('Failed to parse accumulated JSON string:', parseError);
                logger.error('Accumulated string was:', accumulatedJsonString);
            }
        } // End if (generationComplete || turnComplete)

    } catch (error) {
        // Handle errors parsing the initial chunk JSON or other unexpected errors
        logger.error('Failed to parse/process raw chunk from Google Live API:', error);
        logger.warn('Raw Google response chunk was:', responseData.toString('utf-8'));
        this.state.accumulatedResponseJsonString = ''; // Clear accumulator on outer error too
    }
  }

  private sendUpdateToClient(): void {
    if (this.clientWs.readyState === WebSocket.OPEN && this.state.validationResult) {
      const updatePayload = JSON.stringify({
        type: 'analysisUpdate',
        ingredients: Array.from(this.state.accumulatedIngredients),
        isVegan: this.state.validationResult.isVegan,
        confidence: this.state.validationResult.confidence,
        nonVeganIngredients: this.state.validationResult.nonVeganIngredients,
        uncertainIngredients: this.state.validationResult.uncertainIngredients,
        reasoning: this.state.validationResult.reasoning,
      });
      this.clientWs.send(updatePayload);
      logger.debug('Sent update to client.');
    } else if (this.clientWs.readyState !== WebSocket.OPEN) {
        logger.warn('Attempted to send update, but client WebSocket is not open.');
    }
  }

  private cleanup(): void {
    logger.info('Cleaning up LiveAnalysisService session.');
    this.state.accumulatedResponseJsonString = ''; // Clear accumulator on cleanup
    // Close Google API connection if open
    if (this.state.googleApiWebSocket && this.state.googleApiWebSocket.readyState === WebSocket.OPEN) {
      this.state.googleApiWebSocket.close();
    }
    this.state.googleApiConnected = false;
    this.state.googleApiWebSocket = undefined;

    // Ensure client connection is closed if not already
    if (this.clientWs.readyState === WebSocket.OPEN || this.clientWs.readyState === WebSocket.CONNECTING) {
        this.clientWs.terminate(); // Force close if needed
    }
    // TODO: Perform any final usage tracking/logging?
  }

  // --- New method to handle usage limits ---
  private async handleUsageLimit(): Promise<boolean> {
    if (!this.state.userId) {
      logger.error('handleUsageLimit called without userId set.');
      return false;
    }

    try {
      const usageInfo = await checkUserLimit(this.state.userId);
      logger.info('Usage check result:', usageInfo);

      // Check if limit is exceeded (and user is not premium)
      if (!usageInfo.isPremium && !usageInfo.hasRemainingAnalyses) {
        logger.warn(`User ${this.state.userId} has exceeded usage limit.`);
        const errorPayload = JSON.stringify({
          type: 'error',
          error: 'USAGE_LIMIT_EXCEEDED',
          message: `Usage limit (${usageInfo.analysesLimit} analyses) exceeded.`,
          details: {
            analysesUsed: usageInfo.analysesUsed,
            analysesLimit: usageInfo.analysesLimit
          }
        });
        this.clientWs.send(errorPayload);
        this.clientWs.close(1008, 'Usage limit exceeded'); // 1008 = Policy Violation
        this.cleanup();
        return false;
      }

      // If limit is ok, increment the count
      logger.info(`Incrementing analysis count for user ${this.state.userId}`);
      const incrementResult = await incrementAnalysisCount(this.state.userId);
      
      // Assume success if no error is thrown, as the function is currently neutralized
      // and doesn't return a specific success/error status.
      logger.info('Successfully incremented analysis count (simulated).', incrementResult);
      this.state.usageCheckOk = true;
      return true;

    } catch (error) {
      logger.error(`Error checking/incrementing usage for user ${this.state.userId}:`, error);
      const errorPayload = JSON.stringify({
        type: 'error',
        error: 'SERVER_ERROR',
        message: 'Error checking usage limits.'
      });
      this.clientWs.send(errorPayload);
      this.clientWs.close(1011, 'Internal server error');
      this.cleanup();
      return false;
    }
  }
  // --- End new method ---
} 