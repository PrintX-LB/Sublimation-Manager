import sharp from "sharp";

async function checkBorders(filePath) {
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;
    
    const buffer = await image.raw().toBuffer();
    
    let topHasColor = false;
    for (let x = 0; x < width; x++) {
      const idx = x * 4;
      const r = buffer[idx];
      const g = buffer[idx + 1];
      const b = buffer[idx + 2];
      const a = buffer[idx + 3];
      if (a > 10 && (r < 240 || g < 240 || b < 240)) {
        topHasColor = true;
        break;
      }
    }

    console.log(`Original File: ${filePath}`);
    console.log(`Dimensions: ${width}x${height}`);
    console.log(`Top row has non-white pixels: ${topHasColor}`);
  } catch (err) {
    console.error(`Error checking borders of ${filePath}:`, err.message);
  }
}

async function main() {
  await checkBorders("C:/Users/tonyn/AppData/Local/PrintX/storage/orders/PX00001 - Tony/original/0cf49c6f-824f-4568-b769-b4107f4f891f.png");
  await checkBorders("C:/Users/tonyn/AppData/Local/PrintX/storage/orders/PX00001 - Tony/original/b52416ba-3eb1-47b8-8fe5-9d8179a46fe2.png");
}

main();
