/**
 * Utilities for handling errors consistently across the application
 */

import { logger } from './logger';

/**
 * Represents an application error with additional context
 */
export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: any;

  constructor(message: string, statusCode = 500, code = 'SERVER_ERROR', details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error codes for the application
 */
export enum ErrorCode {
  SERVER_ERROR = 'SERVER_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  VIDEO_PROCESSING_ERROR = 'VIDEO_PROCESSING_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR'
}

/**
 * Log an error with appropriate detail level
 */
export function logError(error: Error, context?: any): void {
  if (error instanceof AppError) {
    logger.error(`${error.code}: ${error.message}`, {
      statusCode: error.statusCode,
      details: error.details,
      context,
      stack: error.stack
    });
  } else {
    logger.error(`Unhandled error: ${error.message}`, {
      context,
      stack: error.stack
    });
  }
}

/**
 * Create a standardized error response object
 */
export function createErrorResponse(error: Error): any {
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    };
  }
  
  return {
    success: false,
    error: ErrorCode.SERVER_ERROR,
    message: error.message || 'An unexpected error occurred'
  };
}

/**
 * Utility to safely parse JSON with error handling
 */
export function safeJsonParse(jsonString: string, fallbackValue: any = null): any {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logger.warn(`Failed to parse JSON: ${(error as Error).message}`, {
      jsonPreview: jsonString.length > 100 ? `${jsonString.substring(0, 100)}...` : jsonString
    });
    return fallbackValue;
  }
}

export default {
  AppError,
  ErrorCode,
  logError,
  createErrorResponse,
  safeJsonParse
}; 