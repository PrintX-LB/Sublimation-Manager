import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const databaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL?.trim() : undefined;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not configured. Create a root .env file (copy .env.example) before starting PrintX.",
  );
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    {
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    }
  );

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
