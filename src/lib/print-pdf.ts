import { deflateSync } from "node:zlib";
import sharp from "sharp";

export type PdfPageSize = {
  widthMm: number;
  heightMm: number;
};

const mmToPoints = (mm: number) => (mm / 25.4) * 72;

/**
 * Wraps a rendered sheet image in a real PDF page whose MediaBox is expressed
 * in the selected physical millimetre dimensions. The image is rasterized at
 * the sheet's configured DPI, while the PDF page itself remains exact-size.
 */
export async function createExactSizePdf(
  image: Buffer,
  page: PdfPageSize,
): Promise<Buffer> {
  if (!Number.isFinite(page.widthMm) || page.widthMm <= 0 || !Number.isFinite(page.heightMm) || page.heightMm <= 0) {
    throw new Error("INVALID_PDF_PAGE_SIZE");
  }
  const { data, info } = await sharp(image)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const compressed = deflateSync(data);
  const widthPt = mmToPoints(page.widthMm).toFixed(4);
  const heightPt = mmToPoints(page.heightMm).toFixed(4);
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /CropBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    Buffer.from(`<< /Length ${Buffer.byteLength(`q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`, "ascii")} >>\nstream\nq\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\nendstream`),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`),
      compressed,
      Buffer.from("\nendstream"),
    ]),
  ];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n")];
  const offsets: number[] = [0];
  let offset = chunks[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const header = Buffer.from(`${index + 1} 0 obj\n`);
    const footer = Buffer.from("\nendobj\n");
    chunks.push(header, object, footer);
    offset += header.length + object.length + footer.length;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
  for (let index = 1; index <= objects.length; index += 1) {
    xref.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(Buffer.from(xref.join("")));
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

export function pdfFilename(value: string, fallback = "print-sheet.pdf") {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stem = safe.replace(/\.(?:png|jpe?g|webp|pdf)$/i, "") || fallback.replace(/\.pdf$/i, "");
  return `${stem}.pdf`;
}
