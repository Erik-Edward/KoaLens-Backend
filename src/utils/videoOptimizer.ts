import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

const execAsync = promisify(exec);

/**
 * Utility class for optimizing video files for AI processing
 * Handles video size reduction and quality adjustment to meet API limitations
 */
export class VideoOptimizer {
  private readonly ffmpegInstalled: boolean;
  
  constructor() {
    // Check if ffmpeg is installed
    this.ffmpegInstalled = this.checkFfmpegInstalled();
    
    logger.info('VideoOptimizer initialized', { 
      ffmpegInstalled: this.ffmpegInstalled
    });
  }
  
  /**
   * Check if ffmpeg is installed on the system
   */
  private checkFfmpegInstalled(): boolean {
    try {
      execAsync('ffmpeg -version');
      return true;
    } catch (error) {
      logger.warn('ffmpeg not found, video optimization will be limited', { error });
      return false;
    }
  }
  
  /**
   * Optimize video file for AI processing
   * Reduces size and quality to meet API limitations
   * 
   * @param inputPath Path to the input video file
   * @param outputPath Path to save the optimized video
   * @returns Path to the optimized video file, or original if optimization failed
   */
  async optimize(inputPath: string, outputPath: string): Promise<string> {
    if (!this.ffmpegInstalled) {
      logger.warn('Cannot optimize video: ffmpeg not available');
      return inputPath; // Return original path if ffmpeg not available
    }
    
    try {
      // Check if input file exists
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file does not exist: ${inputPath}`);
      }
      
      // Check file size to determine optimization strategy
      const stats = fs.statSync(inputPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      logger.debug('Video optimization started', { 
        inputPath, 
        fileSizeMB: fileSizeMB.toFixed(2)
      });
      
      let ffmpegCommand: string;
      
      // Choose optimization strategy based on file size
      if (fileSizeMB > 50) {
        // Heavy optimization for large files
        ffmpegCommand = `ffmpeg -y -i "${inputPath}" -vf "scale=480:-2" -c:v libx264 -crf 28 -preset faster -c:a aac -b:a 64k -movflags +faststart "${outputPath}"`;
        logger.debug('Using heavy optimization for large video');
      } else if (fileSizeMB > 20) {
        // Medium optimization for medium files
        ffmpegCommand = `ffmpeg -y -i "${inputPath}" -vf "scale=720:-2" -c:v libx264 -crf 24 -preset medium -c:a aac -b:a 96k -movflags +faststart "${outputPath}"`;
        logger.debug('Using medium optimization for medium-sized video');
      } else {
        // Light optimization for small files
        ffmpegCommand = `ffmpeg -y -i "${inputPath}" -c:v libx264 -crf 22 -preset medium -c:a copy -movflags +faststart "${outputPath}"`;
        logger.debug('Using light optimization for small video');
      }
      
      // Execute ffmpeg command
      await execAsync(ffmpegCommand);
      
      // Verify the output file exists and is not empty
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new Error('Optimization failed: output file is empty or does not exist');
      }
      
      // Calculate compression ratio
      const outputStats = fs.statSync(outputPath);
      const outputSizeMB = outputStats.size / (1024 * 1024);
      const compressionRatio = fileSizeMB / outputSizeMB;
      
      logger.info('Video optimization completed', {
        originalSizeMB: fileSizeMB.toFixed(2),
        optimizedSizeMB: outputSizeMB.toFixed(2),
        compressionRatio: compressionRatio.toFixed(2)
      });
      
      return outputPath;
    } catch (error: any) {
      logger.error('Video optimization failed', { 
        error: error.message,
        inputPath
      });
      
      // Return original path if optimization fails
      return inputPath;
    }
  }
  
  /**
   * Extract a single frame from a video file at a specific time offset
   * 
   * @param videoPath Path to the video file
   * @param outputPath Path to save the extracted frame image
   * @param timeOffset Time offset in seconds to extract frame from
   * @returns Path to the extracted frame image, or null if extraction failed
   */
  async extractFrame(videoPath: string, outputPath: string, timeOffset: number = 0): Promise<string | null> {
    if (!this.ffmpegInstalled) {
      logger.warn('Cannot extract frame: ffmpeg not available');
      return null;
    }
    
    try {
      // Check if input file exists
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Input video file does not exist: ${videoPath}`);
      }
      
      // Format time offset as HH:MM:SS
      const formattedTime = new Date(timeOffset * 1000).toISOString().substr(11, 8);
      
      // Construct ffmpeg command to extract a single frame
      const ffmpegCommand = `ffmpeg -y -i "${videoPath}" -ss ${formattedTime} -frames:v 1 -q:v 2 "${outputPath}"`;
      
      // Execute ffmpeg command
      await execAsync(ffmpegCommand);
      
      // Verify the output file exists
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new Error('Frame extraction failed: output file is empty or does not exist');
      }
      
      logger.info('Video frame extracted successfully', {
        videoPath,
        outputPath,
        timeOffset
      });
      
      return outputPath;
    } catch (error: any) {
      logger.error('Video frame extraction failed', { 
        error: error.message,
        videoPath,
        timeOffset
      });
      
      return null;
    }
  }
} 