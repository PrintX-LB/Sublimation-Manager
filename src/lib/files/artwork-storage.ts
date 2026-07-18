import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensureOrderFolder } from "@/lib/order-storage";

export async function getOrderArtworkDirectory(
  orderNumber: string,
  folder: "original" | "edited" | "print-ready",
  customerName?: string,
) {
  const orderFolder = await ensureOrderFolder(orderNumber, customerName);
  const directory = path.join(orderFolder, folder);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function saveArtworkFile(
  file: File,
  orderNumber: string,
  folder: "original" | "edited" | "print-ready",
  year: number,
  month: number,
  customerName?: string,
) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("FILE_TYPE_INVALID");
  if (file.size <= 0 || file.size > 20 * 1024 * 1024)
    throw new Error("FILE_SIZE_INVALID");
  // Artwork belongs to the order's configured storage folder so it is included
  // in backups alongside attachments and exports. Paths stored in the database
  // are absolute because the configured folder may be outside the application.
  const directory = await getOrderArtworkDirectory(orderNumber, folder, customerName);
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
  return filePath;
}
