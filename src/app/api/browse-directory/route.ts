import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";

export async function GET(request: Request) {
  // Enforce security checks: must be in admin mode, and only available on local installations
  const session = await getAdminSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Restrict to local usage
  const hostname = request.headers.get("host") || "";
  const isLocal = hostname.includes("localhost") || hostname.includes("127.0.0.1") || hostname.startsWith("::1");
  if (!isLocal && process.env.NODE_ENV === "production") {
    return new NextResponse("Forbidden: Local operations only", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  let currentPath = searchParams.get("path")?.trim() || "";

  // If path is empty, default to project cwd
  if (!currentPath) {
    currentPath = process.cwd();
  }

  try {
    const resolvedPath = path.resolve(currentPath);

    // List contents
    const dirents = await readdir(resolvedPath, { withFileTypes: true });
    
    // Extract directories
    const subdirs = dirents
      .filter((ent) => ent.isDirectory())
      .map((ent) => ent.name)
      .sort((a, b) => a.localeCompare(b));

    // Get parent path
    const parentPath = path.dirname(resolvedPath);

    // Get available logical drives on Windows (fallback check)
    let drives: string[] = [];
    if (process.platform === "win32") {
      // Return standard active drives
      drives = ["C:\\", "D:\\", "E:\\", "F:\\"];
    }

    return NextResponse.json({
      currentPath: resolvedPath,
      parentPath: parentPath !== resolvedPath ? parentPath : null,
      subdirs,
      drives,
    });
  } catch (err) {
    console.error("Directory browse error:", err);
    return new NextResponse("Directory not found or inaccessible", { status: 404 });
  }
}
