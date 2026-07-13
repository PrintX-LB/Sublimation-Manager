import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const root = path.resolve(process.cwd(), "uploads");
const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("path");
  if (!value) return new NextResponse("Missing path", { status: 400 });
  const target = path.resolve(process.cwd(), value);
  if (!target.startsWith(`${root}${path.sep}`)) return new NextResponse("Invalid path", { status: 400 });
  try {
    const data = await readFile(target);
    return new NextResponse(data, { headers: { "Content-Type": types[path.extname(target).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
  } catch { return new NextResponse("File not found", { status: 404 }); }
}
