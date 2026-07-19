import sharp from "sharp";

async function checkBorders(filePath) {
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;
    
    // Extract a 1-pixel border region
    const buffer = await image.raw().toBuffer();
    
    // Check top row (y = 0)
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

    console.log(`File: ${filePath}`);
    console.log(`Dimensions: ${width}x${height}`);
    console.log(`Top row has non-white pixels: ${topHasColor}`);
  } catch (err) {
    console.error(`Error checking borders of ${filePath}:`, err.message);
  }
}

async function main() {
  await checkBorders("C:/Users/tonyn/AppData/Local/PrintX/storage/orders/PX00001 - Tony/print-ready/version-1-1784476495028.png");
  await checkBorders("C:/Users/tonyn/AppData/Local/PrintX/storage/orders/PX00001 - Tony/print-ready/version-1-1784476481417.png");
}

main();
