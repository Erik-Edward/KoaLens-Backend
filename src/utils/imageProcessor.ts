// src/utils/imageProcessor.ts

interface CompressionOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  isLandscape?: boolean;
  enhanceContrast?: boolean;
}

export const IMAGE_CONSTANTS = {
  MAX_SIZE: 5 * 1024 * 1024,       // 5MB i bytes
  TARGET_SIZE: 3 * 1024 * 1024,    // Sikta på 3MB för att ha marginal för base64
  QUALITY_LEVELS: {
    HIGH: 80,
    MEDIUM: 60,
    LOW: 40
  },
  DIMENSIONS: {
    LANDSCAPE: {
      MAX_WIDTH: 2400,
      MAX_HEIGHT: 1800
    },
    PORTRAIT: {
      MAX_WIDTH: 1800,
      MAX_HEIGHT: 2400
    }
  }
} as const;

/**
 * Komprimerar en base64-kodad bild med anpassade inställningar
 * @param base64Image Base64-kodad bildsträng
 * @param options Komprimeringsinställningar inklusive orientering
 * @returns Promise<string> Komprimerad base64-kodad bildsträng
 */
export async function compressImage(
  base64Image: string, 
  options: CompressionOptions = {}
): Promise<string> {
  try {
    // Load necessary modules dynamically
    const sharp = (await import('sharp')).default;
    const Buffer = (await import('buffer')).Buffer;

    // Remove the data:image/jpeg;base64, part if present
    const base64WithoutPrefix = base64Image.includes(',')
      ? base64Image.split(',')[1]
      : base64Image;

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64WithoutPrefix, 'base64');

    // Get image info
    const metadata = await sharp(imageBuffer).metadata();
    const origWidth = metadata.width || 1000;
    const origHeight = metadata.height || 1000;

    // Calculate new dimensions
    const maxWidth = options.maxWidth || 1500;
    const maxHeight = options.maxHeight || 1500;
    const scaleFactor = Math.min(
      maxWidth / origWidth,
      maxHeight / origHeight,
      1 // Don't upscale images
    );
    const width = Math.floor(origWidth * scaleFactor);
    const height = Math.floor(origHeight * scaleFactor);

    // Process the image
    let processedImage = sharp(imageBuffer)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      });

    // Apply contrast enhancement if requested
    if (options.enhanceContrast) {
      processedImage = processedImage
        .normalize() // Automatically improve contrast
        .modulate({ brightness: 1.05 }) // Slightly increase brightness
        .sharpen({ sigma: 1.2 }); // Sharpen the image
    } else {
      // Apply only basic sharpening for better text readability
      processedImage = processedImage.sharpen({ sigma: 0.8 });
    }

    // Compress the image
    const compressedImageBuffer = await processedImage
      .jpeg({
        quality: options.quality ? Math.floor(options.quality * 100) : 80,
        mozjpeg: true, // Use mozjpeg for better compression
      })
      .toBuffer();

    // Convert back to base64
    const compressedBase64 = compressedImageBuffer.toString('base64');

    // If the compressed image is larger than the original, return the original
    if (compressedBase64.length > base64WithoutPrefix.length) {
      console.log(
        'Compressed image is larger than original, returning original'
      );
      return base64WithoutPrefix;
    }

    const finalSize = getBase64Size(compressedBase64);
    const initialSize = getBase64Size(base64WithoutPrefix);
    console.log(`First compression size: ${(finalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Final base64 size: ${(finalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Compression ratio: ${(finalSize / initialSize * 100).toFixed(1)}%`);

    return compressedBase64;
  } catch (error) {
    console.error('Error compressing image:', error);
    // Return the original image if compression fails
    return base64Image.includes(',')
      ? base64Image.split(',')[1]
      : base64Image;
  }
}

/**
 * Beräknar storleken i bytes för en base64-kodad sträng
 * @param base64String Base64-kodad sträng
 * @returns number Storlek i bytes
 */
export function getBase64Size(base64String: string): number {
  // Remove the data:image/jpeg;base64, part if present
  const base64WithoutPrefix = base64String.includes(',')
    ? base64String.split(',')[1]
    : base64String;
  return (base64WithoutPrefix.length * 3) / 4;
}

/**
 * Kontrollerar om en bild är för stor för att processas
 * @param base64String Base64-kodad bildsträng
 * @param maxSize Maximal tillåten storlek i bytes
 * @returns boolean Sant om bilden är för stor
 */
export function isImageTooLarge(base64String: string, maxSize: number = IMAGE_CONSTANTS.MAX_SIZE): boolean {
  return getBase64Size(base64String) > maxSize;
}