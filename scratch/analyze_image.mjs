import sharp from "sharp";

async function main() {
  const filePath = "C:/Users/tonyn/AppData/Local/PrintX/storage/orders/PX00001 - Tony/print-ready/version-2-1784477523372.png";
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;
    
    const buffer = await image.raw().toBuffer();
    
    // Check left column (x = 0)
    let leftColumnHasColor = false;
    for (let y = 0; y < height; y++) {
      const idx = y * width * 4;
      const r = buffer[idx];
      const g = buffer[idx + 1];
      const b = buffer[idx + 2];
      const a = buffer[idx + 3];
      if (a > 10 && (r < 240 || g < 240 || b < 240)) {
        leftColumnHasColor = true;
        break;
      }
    }
    
    // Check right column (x = width - 1)
    let rightColumnHasColor = false;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + (width - 1)) * 4;
      const r = buffer[idx];
      const g = buffer[idx + 1];
      const b = buffer[idx + 2];
      const a = buffer[idx + 3];
      if (a > 10 && (r < 240 || g < 240 || b < 240)) {
        rightColumnHasColor = true;
        break;
      }
    }

    console.log(`Dimensions: ${width}x${height}`);
    console.log(`Leftmost column has color: ${leftColumnHasColor}`);
    console.log(`Rightmost column has color: ${rightColumnHasColor}`);
    
    // Find all columns that have color
    const coloredColumns = [];
    for (let x = 0; x < width; x++) {
      let colHasColor = false;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const r = buffer[idx];
        const g = buffer[idx + 1];
        const b = buffer[idx + 2];
        const a = buffer[idx + 3];
        if (a > 10 && (r < 240 || g < 240 || b < 240)) {
          colHasColor = true;
          break;
        }
      }
      if (colHasColor) {
        coloredColumns.push(x);
      }
    }
    console.log(`Columns with color: ${coloredColumns.length} of ${width}`);
    console.log(`First colored col: ${coloredColumns[0]}, Last colored col: ${coloredColumns[coloredColumns.length - 1]}`);

  } catch (err) {
    console.error(err);
  }
}

main();
