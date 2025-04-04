import { Router, Request, Response, RequestHandler } from 'express';
import { logger } from '../utils/logger';
import { supabase } from '../services/supabaseService'; // Import Supabase client

// Define the structure for the incoming ingredient report data
interface IngredientReport {
  ingredient: string;
  feedback: string;
  productId?: string; // Optional: ID of the product/analysis
  isVegan?: boolean; // Optional: Product status at time of report
  userId?: string; // Optional: User ID (or 'anonymous')
  timestamp?: string; // Optional: Client-provided timestamp (ISO 8601 format expected)
}

const router = Router();

/**
 * POST /api/report/ingredient
 * Endpoint for receiving and storing ingredient feedback reports from users.
 */
router.post('/ingredient', (async (req: Request, res: Response) => {
  const reportData = req.body as IngredientReport;
  
  logger.debug('Received raw ingredient report data', { rawData: reportData });

  try {
    // 1. Validate required fields
    if (!reportData.ingredient || typeof reportData.ingredient !== 'string' || reportData.ingredient.trim() === '') {
      logger.warn('Ingredient report rejected: Missing or invalid ingredient field', { reportData });
      res.status(400).json({ 
        success: false, 
        error: 'Missing or invalid required field: ingredient' 
      });
      return;
    }
    
    if (!reportData.feedback || typeof reportData.feedback !== 'string' || reportData.feedback.trim() === '') {
      logger.warn('Ingredient report rejected: Missing or invalid feedback field', { reportData });
       res.status(400).json({ 
        success: false, 
        error: 'Missing or invalid required field: feedback' 
      });
       return;
    }

    // 2. Prepare data for Supabase insertion
    const reportToInsert = {
      ingredient_name: reportData.ingredient.trim(),
      feedback_text: reportData.feedback.trim(),
      product_id: reportData.productId || null,
      is_vegan_at_report_time: reportData.isVegan !== undefined ? reportData.isVegan : null,
      user_id: reportData.userId || 'anonymous', // Uses DB default if null/undefined
      // Attempt to parse client timestamp, otherwise leave null for DB default
      client_timestamp: reportData.timestamp ? new Date(reportData.timestamp).toISOString() : null
      // 'status' will use the default 'new' from the database
    };

    // 3. Insert data into Supabase
    logger.info('Attempting to insert ingredient report into Supabase...', { report: reportToInsert });
    const { error: insertError } = await supabase
      .from('ingredient_reports')
      .insert([reportToInsert]); // insert expects an array

    if (insertError) {
      logger.error('Failed to insert ingredient report into Supabase', { 
        error: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        reportData: reportToInsert 
      });
      // Throw an error to be caught by the main error handler
      throw new Error('Database error while saving report.'); 
    }

    logger.info('Ingredient report successfully saved to Supabase', { 
        ingredient: reportToInsert.ingredient_name,
        userId: reportToInsert.user_id
    });

    // 4. Send success response
    res.status(200).json({ 
      success: true, 
      message: 'Ingredient report received and saved successfully.' 
    });
    return;

  } catch (error: any) {
    // 5. Handle errors (including validation and Supabase errors)
    logger.error('Error processing ingredient report', { 
      error: error.message,
      stack: error.stack,
      reportData // Log the original data that caused the error
    });
    
    // Determine status code based on error type if possible
    const statusCode = error.message.includes('Database error') ? 500 : 400;
    
    res.status(statusCode).json({ 
      success: false, 
      error: error.message || 'Internal server error while processing report.' 
    });
    return;
  }
}) as RequestHandler);

export default router; 