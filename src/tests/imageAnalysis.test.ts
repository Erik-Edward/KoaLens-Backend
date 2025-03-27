import { imageProcessor } from '../services/imageProcessor';
import analysisService from '../services/analysisService';
import promptManager from '../utils/promptManager';
import { loadImagePromptTemplates } from '../config/imagePrompts';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Mock environment for testing
process.env.NODE_ENV = 'test';

// Setup test directories
const TEST_DIR = path.join(__dirname, 'test-data');
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache', 'images');

// Ensure test directories exist
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

describe('Image Analysis Service', () => {
  // Prepare mock service
  beforeAll(async () => {
    // Load prompt templates
    loadImagePromptTemplates(promptManager);
    
    // Create dummy test images if they don't exist
    await createTestImages();
  });
  
  describe('Image Processing', () => {
    it('should optimize images for OCR', async () => {
      // Read test image
      const testImagePath = path.join(TEST_DIR, 'test-image.jpg');
      const imageBuffer = fs.readFileSync(testImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Process image
      const optimizedImage = await imageProcessor.optimizeForOCR(imageBase64);
      
      // Verify image was processed
      expect(optimizedImage).toBeTruthy();
      expect(typeof optimizedImage).toBe('string');
      
      // Optimized image should be different from original
      expect(optimizedImage).not.toEqual(imageBase64);
    });
    
    it('should enhance low-light images', async () => {
      // Read test image
      const testImagePath = path.join(TEST_DIR, 'low-light-image.jpg');
      const imageBuffer = fs.readFileSync(testImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Process image
      const enhancedImage = await imageProcessor.enhanceIngredientList(imageBase64);
      
      // Verify image was processed
      expect(enhancedImage).toBeTruthy();
      expect(typeof enhancedImage).toBe('string');
      
      // Enhanced image should be different from original
      expect(enhancedImage).not.toEqual(imageBase64);
    });
    
    it('should compress large images', async () => {
      // Read test image
      const testImagePath = path.join(TEST_DIR, 'large-image.jpg');
      const imageBuffer = fs.readFileSync(testImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Get original size
      const originalSize = imageProcessor.getImageSize(imageBase64);
      
      // Compress image
      const compressedImage = await imageProcessor.compressImage(imageBase64, {
        quality: 70,
        width: 800,
        height: 800
      });
      
      // Get compressed size
      const compressedSize = imageProcessor.getImageSize(compressedImage);
      
      // Verify compression
      expect(compressedImage).toBeTruthy();
      expect(compressedSize).toBeLessThan(originalSize);
    });
    
    it('should cache processed images', async () => {
      // Generate unique test image to ensure fresh cache entry
      const testImagePath = path.join(TEST_DIR, 'cache-test.jpg');
      const imageBuffer = fs.readFileSync(testImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Get cache filename
      const imageHash = imageProcessor.generateImageHash(imageBase64);
      const cacheFilePath = path.join(CACHE_DIR, `${imageHash}-ocr.jpg`);
      
      // Remove if exists to ensure clean test
      if (fs.existsSync(cacheFilePath)) {
        fs.unlinkSync(cacheFilePath);
      }
      
      // Process image first time should create cache
      await imageProcessor.optimizeForOCR(imageBase64);
      
      // Verify cache was created
      expect(fs.existsSync(cacheFilePath)).toBe(true);
      
      // Process same image again
      const startTime = Date.now();
      const cachedImage = await imageProcessor.optimizeForOCR(imageBase64);
      const processingTime = Date.now() - startTime;
      
      // Should be faster for cached image
      expect(processingTime).toBeLessThan(50); // Very fast for cached image
    });
  });
  
  describe('Image Analysis with Gemini', () => {
    // These tests require actual API calls and valid test images
    // Mark as conditional tests that can be skipped in CI
    
    it('should analyze a vegan product image', async () => {
      if (process.env.SKIP_API_TESTS) {
        console.log('Skipping API test');
        return;
      }
      
      // Read test image with known vegan product
      const testImagePath = path.join(TEST_DIR, 'vegan-product.jpg');
      const imageBuffer = fs.readFileSync(testImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Analyze the image
      const result = await analysisService.analyzeImage(imageBase64);
      
      // Verify analysis
      expect(result).toBeTruthy();
      expect(result.isVegan).toBe(true);
      expect(result.nonVeganIngredients.length).toBe(0);
      expect(result.confidence).toBeGreaterThan(0.7);
    }, 30000); // Increased timeout for API call
    
    it('should analyze a non-vegan product image', async () => {
      if (process.env.SKIP_API_TESTS) {
        console.log('Skipping API test');
        return;
      }
      
      // Read test image with known non-vegan product
      const testImagePath = path.join(TEST_DIR, 'non-vegan-product.jpg');
      const imageBuffer = fs.readFileSync(testImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Analyze the image
      const result = await analysisService.analyzeImage(imageBase64);
      
      // Verify analysis
      expect(result).toBeTruthy();
      expect(result.isVegan).toBe(false);
      expect(result.nonVeganIngredients.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.7);
    }, 30000); // Increased timeout for API call
    
    it('should handle low quality images', async () => {
      if (process.env.SKIP_API_TESTS) {
        console.log('Skipping API test');
        return;
      }
      
      // Read test image with poor quality
      const testImagePath = path.join(TEST_DIR, 'low-quality-image.jpg');
      const imageBuffer = fs.readFileSync(testImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Analyze the image
      const result = await analysisService.analyzeImage(imageBase64);
      
      // Verify analysis includes quality warnings
      expect(result).toBeTruthy();
      if (result.imageQualityIssues) {
        expect(result.imageQualityIssues.length).toBeGreaterThan(0);
      }
      
      // For poor quality images, confidence should be lower
      expect(result.confidence).toBeLessThan(0.9);
    }, 30000); // Increased timeout for API call
  });
});

/**
 * Helper function to create test images if they don't exist
 */
async function createTestImages() {
  // Create test data directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  
  // List of test images to create
  const testImages = [
    'test-image.jpg',
    'low-light-image.jpg',
    'large-image.jpg',
    'cache-test.jpg',
    'vegan-product.jpg',
    'non-vegan-product.jpg',
    'low-quality-image.jpg'
  ];
  
  for (const imageName of testImages) {
    const imagePath = path.join(TEST_DIR, imageName);
    
    // Skip if file already exists
    if (fs.existsSync(imagePath)) {
      continue;
    }
    
    // Create a simple test image with varying properties based on name
    let width = 800;
    let height = 600;
    let color = 'white';
    
    if (imageName.includes('large')) {
      width = 3000;
      height = 2000;
    } else if (imageName.includes('low-light')) {
      color = 'darkgray';
    } else if (imageName.includes('low-quality')) {
      width = 300;
      height = 200;
      color = 'lightgray';
    }
    
    // For test images, create a simple colored rectangle
    // with random data to make them unique
    const randomData = crypto.randomBytes(10).toString('hex');
    
    // In a real implementation, we would generate actual images
    // For testing purposes, we're just creating placeholder files
    
    const placeholderData = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${color}" />
        <text x="10" y="20" font-family="Arial" font-size="16" fill="black">
          Test image: ${imageName}
        </text>
        <text x="10" y="40" font-family="Arial" font-size="12" fill="black">
          Random: ${randomData}
        </text>
      </svg>
    `);
    
    fs.writeFileSync(imagePath, placeholderData);
  }
} 