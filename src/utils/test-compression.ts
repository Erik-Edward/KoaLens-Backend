// src/utils/test-compression.ts
import sharp from 'sharp';
import { compressImage, getBase64Size, IMAGE_CONSTANTS } from './imageProcessor';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testCompression() {
  try {
    // Läs testbilden från disk
    const imagePath = path.join(__dirname, '..', '..', 'test-images', 'large-test-image.png');
    console.log('Läser testbild:', imagePath);
    
    // Läs bilden som buffer
    const imageBuffer = await fs.readFile(imagePath);
    console.log('Testbild inläst');

    // Visa information om originalbilden
    const imageInfo = await sharp(imageBuffer).metadata();
    console.log('\nBildinformation:');
    console.log('---------------');
    console.log(`Format: ${imageInfo.format}`);
    console.log(`Dimensioner: ${imageInfo.width}x${imageInfo.height}`);
    console.log(`Kanaler: ${imageInfo.channels}`);

    // Konvertera till base64
    const originalBase64 = imageBuffer.toString('base64');
    const originalSize = getBase64Size(originalBase64);
    
    console.log('\nTest av bildkomprimering:');
    console.log('------------------------');
    console.log(`Original bildstorlek: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Komprimeringsgräns: ${(IMAGE_CONSTANTS.MAX_SIZE / 1024 / 1024).toFixed(2)}MB`);

    // Testa komprimering
    console.log('\nKomprimerar...');
    const compressedBase64 = await compressImage(originalBase64);
    const compressedSize = getBase64Size(compressedBase64);
    
    console.log(`Komprimerad bildstorlek: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Komprimeringsgrad: ${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`);

    // Spara den komprimerade bilden för inspektion
    const compressedBuffer = Buffer.from(compressedBase64, 'base64');
    const outputPath = path.join(__dirname, '..', '..', 'test-images', 'compressed-test-image.jpg');
    await fs.writeFile(outputPath, compressedBuffer);
    console.log(`\nKomprimerad bild sparad: ${outputPath}`);
    
    // Verifiera att den komprimerade bilden är under gränsen
    if (compressedSize <= IMAGE_CONSTANTS.MAX_SIZE) {
      console.log('\n✅ Test slutfört framgångsrikt!');
      console.log(`   Bilden är under ${(IMAGE_CONSTANTS.MAX_SIZE / 1024 / 1024).toFixed(2)}MB gränsen`);
    } else {
      console.log('\n❌ Test misslyckades!');
      console.log(`   Bilden är fortfarande över ${(IMAGE_CONSTANTS.MAX_SIZE / 1024 / 1024).toFixed(2)}MB gränsen`);
    }

  } catch (error) {
    console.error('\n❌ Komprimeringstest misslyckades:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Kör testet
testCompression().catch(console.error);