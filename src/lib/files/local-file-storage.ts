import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadRoot = path.resolve(process.cwd(), "uploads");
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function safeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

export async function saveUploadedFile(
  file: File,
  folder: "customers" | "orders" | "templates",
) {
  if (file.size <= 0 || file.size > MAX_FILE_BYTES)
    throw new Error("FILE_SIZE_INVALID");
  if (!allowedMimeTypes.has(file.type)) throw new Error("FILE_TYPE_INVALID");
  const destinationDirectory = path.join(uploadRoot, folder);
  await mkdir(destinationDirectory, { recursive: true });

  const filename = `${randomUUID()}${safeExtension(file.name)}`;
  const absolutePath = path.join(destinationDirectory, filename);
  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()), {
    flag: "wx",
  });

  return path.relative(process.cwd(), absolutePath).replaceAll(path.sep, "/");
}
