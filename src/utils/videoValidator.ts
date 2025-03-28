import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

const execAsync = promisify(exec);

/**
 * Utility class for validating video files before processing
 */
export class VideoValidator {
  /**
   * Maximum allowed video size in bytes (50MB)
   */
  static readonly MAX_VIDEO_SIZE = 50 * 1024 * 1024;
  
  /**
   * Maximum allowed video duration in seconds (30s)
   */
  static readonly MAX_DURATION = 30;
  
  /**
   * Supported video formats
   */
  static readonly SUPPORTED_FORMATS = ['mp4', 'mov', 'webm'];
  
  /**
   * Validate video file for processing
   * @param filePath Path to the video file
   * @throws Error if validation fails
   */
  static async validate(filePath: string): Promise<void> {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('Video file not found');
    }
    
    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size > this.MAX_VIDEO_SIZE) {
      throw new Error(`Video file too large (${Math.round(stats.size / (1024 * 1024))}MB). Maximum size is ${Math.round(this.MAX_VIDEO_SIZE / (1024 * 1024))}MB`);
    }
    
    // Check file extension
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    if (!this.SUPPORTED_FORMATS.includes(extension)) {
      throw new Error(`Unsupported video format: ${extension}. Supported formats: ${this.SUPPORTED_FORMATS.join(', ')}`);
    }
    
    try {
      // Use ffprobe to get video metadata
      const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
      const duration = parseFloat(stdout.trim());
      
      if (isNaN(duration)) {
        throw new Error('Unable to determine video duration');
      }
      
      if (duration > this.MAX_DURATION) {
        throw new Error(`Video duration too long (${Math.round(duration)}s). Maximum duration is ${this.MAX_DURATION}s`);
      }
      
      logger.info('Video validation successful', {
        filePath,
        size: Math.round(stats.size / 1024),
        duration: Math.round(duration * 10) / 10,
        format: extension
      });
    } catch (error: any) {
      if (error.message.includes('ffprobe')) {
        logger.warn('ffprobe not available for video validation, skipping duration check', {
          error: error.message
        });
        // Continue without duration validation if ffprobe is not available
      } else {
        throw error;
      }
    }
  }
} 