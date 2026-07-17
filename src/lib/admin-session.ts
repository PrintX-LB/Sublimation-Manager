import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
export { verifyAdminCredentials } from "@/lib/admin-credentials";
const COOKIE = "printx_admin";
function secret() { const value = process.env.ADMIN_SESSION_SECRET; if (!value) throw new Error("ADMIN_SESSION_SECRET is not configured"); return value; }
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
export async function getAdminSession() { const value = (await cookies()).get(COOKIE)?.value; if (!value) return false; const [payload, signature] = value.split("."); if (!payload || !signature) return false; const expected = sign(payload); return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) && Number(payload) > Date.now(); }
export async function requireAdmin() { if (!(await getAdminSession())) throw new Error("ADMIN_REQUIRED"); }
export async function setAdminSession() { const value = String(Date.now() + 30 * 60 * 1000); (await cookies()).set(COOKIE, `${value}.${sign(value)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1800, path: "/" }); }
export async function clearAdminSession() { (await cookies()).delete(COOKIE); }
