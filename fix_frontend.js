const fs = require('fs');
const file = 'src/app/(admin)/production/sheet-builder/sheet-builder-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// Revert ArtworkVersionData to its original state
content = content.replace(
  `productVariant: { name: string; product: { printTemplate?: { widthMm: number; heightMm: number; dpi: number; bleedMm: number } } } | null;`,
  `productVariant: { name: string } | null;`
);
content = content.replace(
  `project: {
    template?: { widthMm: number; heightMm: number; dpi: number; bleedMm: number };`,
  `project: {`
);

// Fix layoutItems calculation to use the properties that exist
content = content.replace(
  `      const template = v.project.template ?? v.project.orderItem.productVariant?.product.printTemplate;
      const dpi = template?.dpi ?? page.dpi;
      const widthMm = template?.widthMm ? Number(template.widthMm) : (v.widthPx * 25.4) / dpi;
      const heightMm = template?.heightMm ? Number(template.heightMm) : (v.heightPx * 25.4) / dpi;
      return {
        id: \`\${v.id}-\${i}\`,
        widthMm,
        heightMm,
        bleedMm: Number(template?.bleedMm ?? 0),`,
  `      const dpi = v.templateDpi ?? page.dpi;
      const widthMm = v.templateWidthMm || (v.widthPx * 25.4) / dpi;
      const heightMm = v.templateHeightMm || (v.heightPx * 25.4) / dpi;
      return {
        id: \`\${v.id}-\${i}\`,
        widthMm,
        heightMm,
        bleedMm: 0, // Fallback, backend re-fetches real bleed`
);

fs.writeFileSync(file, content, 'utf8');
