// src/utils/test-sharp.ts
import sharp from 'sharp';

async function testSharp() {
  try {
    // Skapa en enkel test-bild
    const testBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 }
      }
    })
    .jpeg()
    .toBuffer();

    console.log('Sharp test succeeded!');
    console.log('Generated buffer size:', testBuffer.length, 'bytes');
    console.log('Sharp version:', sharp.versions);
  } catch (error) {
    console.error('Sharp test failed:', error);
  }
}

testSharp();