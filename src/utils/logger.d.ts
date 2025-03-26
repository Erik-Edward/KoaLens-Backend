import { Logger } from 'winston';

/**
 * TypeScript declaration for logger
 */
export declare const logger: Logger;

/**
 * Log AI request details
 */
export declare function logAIRequest(provider: string, data: any): void;

/**
 * Log AI response details
 */
export declare function logAIResponse(provider: string, data: any): void;