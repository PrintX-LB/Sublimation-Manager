const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/app/(admin)/production/sheet-builder/actions.ts');
let content = fs.readFileSync(file, 'utf8');

// Replace the imports to include calculateSheetLayout and composeAdaptivePrintSheet
content = content.replace(
  `import {
  A4_SHEET,
  SHEET_LAYOUT,
  isThreeUpMugTemplate,
  nextSheetFilename,
  sheetLayout,
} from "@/lib/production-sheet";`,
  `import {
  A4_SHEET,
  calculateSheetLayout,
  nextSheetFilename,
} from "@/lib/production-sheet";`
);

content = content.replace(
  `import { artworkPathForCutMarks, composeThreeUpMugSheet, cutMarksSvg, mirrorArtworkForSheet, normalizeCutMarkSettings } from "@/lib/production-sheet-render";`,
  `import { artworkPathForCutMarks, composeAdaptivePrintSheet, mirrorArtworkForSheet, normalizeCutMarkSettings } from "@/lib/production-sheet-render";`
);

// We will just do a string replacement of the function
const funcStart = 'export async function generateManualSheetAction(formData: FormData) {';
const funcStartIndex = content.indexOf(funcStart);

// find the end of the function (by matching braces, or just doing it manually)
// Actually, it's easier to just replace the whole file from that point.
// Let's just create a new file with the replaced function.
