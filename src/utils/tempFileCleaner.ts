import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

/**
 * Utility class for cleaning up temporary files
 * Provides methods for scheduled cleanup of old temporary files
 */
export class TempFileCleaner {
  private static readonly TEMP_DIR = path.join(os.tmpdir(), 'koalens-videos');
  private static readonly MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  /**
   * Start the scheduler to clean temporary files
   * This is designed to be called on server startup
   */
  static startScheduler(): void {
    // Run cleanup on startup
    this.cleanTempFiles()
      .then(count => {
        if (count > 0) {
          logger.info(`Cleaned up ${count} temporary video files on startup`);
        }
      })
      .catch(error => {
        logger.error('Error cleaning temporary files on startup', { error });
      });
    
    // Schedule regular cleanup (every 6 hours)
    const intervalMs = 6 * 60 * 60 * 1000; // 6 hours
    setInterval(() => {
      this.cleanTempFiles()
        .then(count => {
          if (count > 0) {
            logger.info(`Cleaned up ${count} temporary video files in scheduled cleanup`);
          }
        })
        .catch(error => {
          logger.error('Error in scheduled temporary file cleanup', { error });
        });
    }, intervalMs);
    
    logger.info('Temporary file cleaner scheduler started', {
      tempDir: this.TEMP_DIR,
      cleanupIntervalHours: intervalMs / (60 * 60 * 1000),
      maxAgeHours: this.MAX_AGE_MS / (60 * 60 * 1000)
    });
  }
  
  /**
   * Clean old temporary files
   * @returns Promise resolving to the number of files cleaned
   */
  static async cleanTempFiles(): Promise<number> {
    try {
      // Check if directory exists
      if (!fs.existsSync(this.TEMP_DIR)) {
        return 0;
      }
      
      // Get current time
      const now = Date.now();
      
      // Read directory contents
      const files = fs.readdirSync(this.TEMP_DIR);
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.TEMP_DIR, file);
        
        try {
          // Get file stats
          const stats = fs.statSync(filePath);
          
          // Check if file is older than max age
          if (now - stats.mtimeMs > this.MAX_AGE_MS) {
            fs.unlinkSync(filePath);
            cleanedCount++;
            logger.debug(`Deleted old temporary file: ${file}`, {
              age: Math.round((now - stats.mtimeMs) / (60 * 60 * 1000)) + 'h',
              size: Math.round(stats.size / 1024) + 'KB'
            });
          }
        } catch (error) {
          logger.warn(`Failed to process file during cleanup: ${file}`, { error });
        }
      }
      
      return cleanedCount;
    } catch (error) {
      logger.error('Error in temp file cleanup', { error });
      return 0;
    }
  }
} 