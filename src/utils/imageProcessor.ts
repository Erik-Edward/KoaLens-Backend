// src/utils/imageProcessor.ts
import sharp from 'sharp';

interface CompressionOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  isLandscape?: boolean;
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
    const {
      quality = IMAGE_CONSTANTS.QUALITY_LEVELS.HIGH,
      isLandscape = false,
      maxWidth = isLandscape ? IMAGE_CONSTANTS.DIMENSIONS.LANDSCAPE.MAX_WIDTH : IMAGE_CONSTANTS.DIMENSIONS.PORTRAIT.MAX_WIDTH,
      maxHeight = isLandscape ? IMAGE_CONSTANTS.DIMENSIONS.LANDSCAPE.MAX_HEIGHT : IMAGE_CONSTANTS.DIMENSIONS.PORTRAIT.MAX_HEIGHT
    } = options;

    // Konvertera base64 till buffer
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Första komprimeringen med angivna inställningar
    let compressedImageBuffer = await sharp(imageBuffer)
      .jpeg({
        quality: Math.round(quality), // Sharp förväntar sig heltal 1-100
        progressive: true,
        chromaSubsampling: '4:2:0'
      })
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        position: 'center'
      })
      .toBuffer();

    let size = compressedImageBuffer.length;
    console.log(`First compression size: ${(size / 1024 / 1024).toFixed(2)}MB`);

    // Om storleken är över målstorleken, prova medelhög komprimering
    if (size > IMAGE_CONSTANTS.TARGET_SIZE) {
      console.log('Applying medium compression...');
      compressedImageBuffer = await sharp(compressedImageBuffer)
        .jpeg({
          quality: IMAGE_CONSTANTS.QUALITY_LEVELS.MEDIUM,
          progressive: true,
          chromaSubsampling: '4:2:0'
        })
        .toBuffer();

      size = compressedImageBuffer.length;
      console.log(`Second compression size: ${(size / 1024 / 1024).toFixed(2)}MB`);
    }

    // Om fortfarande över målstorleken, använd maximal komprimering
    if (size > IMAGE_CONSTANTS.TARGET_SIZE) {
      console.log('Applying maximum compression...');
      compressedImageBuffer = await sharp(compressedImageBuffer)
        .jpeg({
          quality: IMAGE_CONSTANTS.QUALITY_LEVELS.LOW,
          progressive: true,
          chromaSubsampling: '4:2:0'
        })
        .toBuffer();

      size = compressedImageBuffer.length;
      console.log(`Final compression size: ${(size / 1024 / 1024).toFixed(2)}MB`);
    }

    // Beräkna slutlig base64-storlek
    const finalBase64 = compressedImageBuffer.toString('base64');
    const finalBase64Size = getBase64Size(finalBase64);
    console.log(`Final base64 size: ${(finalBase64Size / 1024 / 1024).toFixed(2)}MB`);

    if (finalBase64Size > IMAGE_CONSTANTS.MAX_SIZE) {
      throw new Error(`Failed to compress image below ${IMAGE_CONSTANTS.MAX_SIZE / 1024 / 1024}MB after base64 conversion`);
    }

    return finalBase64;
  } catch (error) {
    console.error('Error in compressImage:', error);
    throw new Error('Failed to compress image: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Beräknar storleken i bytes för en base64-kodad sträng
 * @param base64String Base64-kodad sträng
 * @returns number Storlek i bytes
 */
export function getBase64Size(base64String: string): number {
  return Buffer.from(base64String, 'base64').length;
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