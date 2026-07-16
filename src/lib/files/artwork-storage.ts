import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export async function saveArtworkFile(
  file: File,
  orderNumber: string,
  folder: "original" | "edited" | "print-ready",
  year: number,
  month: number,
) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("FILE_TYPE_INVALID");
  if (file.size <= 0 || file.size > 20 * 1024 * 1024)
    throw new Error("FILE_SIZE_INVALID");
  const relative = path.join(
    "uploads",
    String(year),
    String(month).padStart(2, "0"),
    orderNumber,
    folder,
  );
  const directory = path.join(process.cwd(), relative);
  await mkdir(directory, { recursive: true });
  const extension =
    file.type === "image/jpeg"
      ? ".jpg"
      : file.type === "image/webp"
        ? ".webp"
        : ".png";
  const filePath = path.join(directory, `${randomUUID()}${extension}`);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()), {
    flag: "wx",
  });
  return relative.replaceAll(path.sep, "/") + "/" + path.basename(filePath);
}
