import sharp from 'sharp';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// Define types for image processing options
export interface ImageOptimizationOptions {
  quality?: number;
  width?: number;
  height?: number;
  grayscale?: boolean;
  enhanceContrast?: boolean;
  sharpen?: boolean;
}

/**
 * Service for image processing and optimization
 * Especially focused on improving OCR and text recognition for ingredient lists
 */
export class ImageProcessor {
  private cacheDir: string;
  
  constructor() {
    // Create cache directory if it doesn't exist
    this.cacheDir = path.join(process.cwd(), 'cache', 'images');
    this.ensureCacheDirectoryExists();
    
    logger.info('ImageProcessor initialized');
  }
  
  /**
   * Optimize an image for OCR/text analysis
   */
  async optimizeForOCR(imageBase64: string): Promise<string> {
    try {
      // Generate a hash for the image to use for caching
      const imageHash = this.generateImageHash(imageBase64);
      const cachedPath = path.join(this.cacheDir, `${imageHash}-ocr.jpg`);
      
      // Check if this image has already been processed
      if (await this.checkCacheExists(cachedPath)) {
        logger.debug('Using cached OCR-optimized image', { imageHash });
        return await this.readCachedImage(cachedPath);
      }
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      // Apply OCR-specific optimizations
      const processedImageBuffer = await sharp(imageBuffer)
        // Convert to grayscale for better text contrast
        .grayscale()
        // Adjust brightness for better readability
        .modulate({ brightness: 1.1 })
        // Increase contrast using linear adjustment
        .linear(1.2, 0)
        // Resize while maintaining aspect ratio
        .resize({
          width: 1800,
          height: 1800,
          fit: 'inside',
          withoutEnlargement: true
        })
        // Add sharpening to improve text clarity
        .sharpen({
          sigma: 1.2,
          m1: 0.5,
          m2: 0.5,
          x1: 2,
          y2: 10,
          y3: 20
        })
        // Produce JPEG with high quality
        .jpeg({ quality: 90 })
        .toBuffer();
      
      // Save to cache
      await this.saveToCache(cachedPath, processedImageBuffer);
      
      // Convert back to base64
      return processedImageBuffer.toString('base64');
    } catch (error: any) {
      logger.error('Image optimization error', { error: error.message, stack: error.stack });
      // If optimization fails, return the original image
      return imageBase64;
    }
  }

  /**
   * Enhance readability specifically for ingredient lists on packaging
   * Specialized for common issues like low contrast on product labels
   */
  async enhanceIngredientList(imageBase64: string): Promise<string> {
    try {
      // Generate hash for caching
      const imageHash = this.generateImageHash(imageBase64);
      const cachedPath = path.join(this.cacheDir, `${imageHash}-enhanced.jpg`);
      
      // Check cache first
      if (await this.checkCacheExists(cachedPath)) {
        logger.debug('Using cached enhanced ingredient image', { imageHash });
        return await this.readCachedImage(cachedPath);
      }
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      // Check if image is low-light
      const isLowLight = await this.isLowLightImage(imageBuffer);
      
      let processedImageBuffer;
      
      if (isLowLight) {
        // Process low-light images with stronger enhancement
        processedImageBuffer = await sharp(imageBuffer)
          .modulate({ brightness: 1.3 })
          .linear(1.4, 0) // Use linear for contrast
          .gamma(2.2)
          .sharpen()
          .jpeg({ quality: 90 })
          .toBuffer();
      } else {
        // Standard enhancement for normal lighting
        processedImageBuffer = await sharp(imageBuffer)
          .modulate({ brightness: 1.1 })
          .linear(1.3, 0) // Use linear for contrast
          .sharpen()
          .jpeg({ quality: 90 })
          .toBuffer();
      }
      
      // Save to cache
      await this.saveToCache(cachedPath, processedImageBuffer);
      
      return processedImageBuffer.toString('base64');
    } catch (error: any) {
      logger.error('Image enhancement error', { error: error.message, stack: error.stack });
      return imageBase64; // Return original if enhancement fails
    }
  }

  /**
   * Compress an image to reduce size while preserving quality
   */
  async compressImage(
    imageBase64: string,
    options: ImageOptimizationOptions = {}
  ): Promise<string> {
    try {
      const {
        quality = 85,
        width = 1500,
        height = 1500,
        grayscale = false,
        enhanceContrast = false,
        sharpen = false
      } = options;
      
      // Generate hash based on input and options for caching
      const optionsHash = crypto
        .createHash('md5')
        .update(JSON.stringify(options))
        .digest('hex')
        .substring(0, 8);
      
      const imageHash = this.generateImageHash(imageBase64);
      const cachedPath = path.join(this.cacheDir, `${imageHash}-${optionsHash}.jpg`);
      
      // Check cache
      if (await this.checkCacheExists(cachedPath)) {
        logger.debug('Using cached compressed image', { imageHash, optionsHash });
        return await this.readCachedImage(cachedPath);
      }
      
      // Convert base64 to buffer
      const buffer = Buffer.from(imageBase64, 'base64');
      
      // Configure image processing pipeline
      let pipeline = sharp(buffer)
        .resize({
          width,
          height,
          fit: 'inside',
          withoutEnlargement: true
        });
      
      // Apply optional transformations
      if (grayscale) {
        pipeline = pipeline.grayscale();
      }
      
      if (enhanceContrast) {
        pipeline = pipeline
          .modulate({ brightness: 1.1 })
          .linear(1.2, 0); // Use linear for contrast
      }
      
      if (sharpen) {
        pipeline = pipeline.sharpen();
      }
      
      // Complete pipeline with JPEG compression
      const compressedBuffer = await pipeline
        .jpeg({ quality })
        .toBuffer();
      
      // Save to cache
      await this.saveToCache(cachedPath, compressedBuffer);
      
      // Return as base64
      return compressedBuffer.toString('base64');
    } catch (error: any) {
      logger.error('Image compression error', { error: error.message, stack: error.stack });
      // Return original if compression fails
      return imageBase64;
    }
  }

  /**
   * Determines if an image was taken in low light conditions
   */
  private async isLowLightImage(imageBuffer: Buffer): Promise<boolean> {
    try {
      // Get image statistics
      const stats = await sharp(imageBuffer).stats();
      
      // Analyze brightness based on channel means
      const channels = stats.channels;
      const avgBrightness = (channels[0].mean + channels[1].mean + channels[2].mean) / 3;
      
      // Low-light images typically have < 60 mean value (on 0-255 scale)
      return avgBrightness < 60;
    } catch (error: any) {
      logger.error('Error analyzing image brightness', { error: error.message });
      return false; // Assume normal brightness if analysis fails
    }
  }

  /**
   * Generate a unique hash for an image
   */
  generateImageHash(imageBase64: string): string {
    return crypto
      .createHash('md5')
      .update(imageBase64)
      .digest('hex');
  }

  /**
   * Calculate image size in bytes
   */
  getImageSize(imageBase64: string): number {
    // Base64 encoding increases size by roughly 4/3
    return Math.ceil(imageBase64.length * 0.75);
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        logger.info('Created image cache directory', { path: this.cacheDir });
      }
    } catch (error: any) {
      logger.error('Failed to create cache directory', { 
        error: error.message, 
        path: this.cacheDir 
      });
    }
  }

  /**
   * Check if a cached image exists
   */
  private async checkCacheExists(filePath: string): Promise<boolean> {
    try {
      return fs.existsSync(filePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Save an image to cache
   */
  private async saveToCache(filePath: string, buffer: Buffer): Promise<void> {
    try {
      await fs.promises.writeFile(filePath, buffer);
      logger.debug('Saved image to cache', { path: filePath });
    } catch (error: any) {
      logger.error('Failed to cache image', { 
        error: error.message, 
        path: filePath 
      });
    }
  }

  /**
   * Read a cached image
   */
  private async readCachedImage(filePath: string): Promise<string> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      return buffer.toString('base64');
    } catch (error: any) {
      logger.error('Failed to read cached image', { 
        error: error.message, 
        path: filePath 
      });
      throw error;
    }
  }
}

// Export a singleton instance
export const imageProcessor = new ImageProcessor(); 