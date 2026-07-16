import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ProductInput } from "@/lib/validation/product";

const PAGE_SIZE = 10;

export async function listProducts({
  search,
  page,
  categoryId,
  status = "active",
  sort = "name",
}: {
  search: string;
  page: number;
  categoryId?: string;
  status?: "active" | "archived" | "all";
  sort?: "name" | "newest" | "oldest";
}) {
  const where: Prisma.ProductWhereInput = {
    ...(status === "all" ? {} : { isActive: status === "active" }),
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { category: { name: { contains: search } } },
          ],
        }
      : {}),
  };
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: {
          where:
            status === "archived"
              ? { isActive: false }
              : status === "all"
                ? {}
                : { isActive: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy:
        sort === "newest"
          ? { createdAt: "desc" }
          : sort === "oldest"
            ? { createdAt: "asc" }
            : { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    products,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      printTemplate: true,
      variants: { where: { isActive: true }, orderBy: { name: "asc" } },
    },
  });
}
export function getProductFormOptions(includeCategoryId?: string) {
  return prisma.$transaction([
    prisma.productCategory.findMany({
      where: {
        OR: [
          { isArchived: false },
          ...(includeCategoryId ? [{ id: includeCategoryId }] : []),
        ],
      },
      select: { id: true, name: true, isArchived: true },
      orderBy: { name: "asc" },
    }),
    prisma.printTemplate.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
}
export function listCategories() {
  return prisma.productCategory.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
}

function variantData(variant: ProductInput["variants"][number]) {
  return {
    name: variant.name,
    optionName: variant.optionName,
    optionValue: variant.optionValue,
    sellingPrice: variant.sellingPrice,
    productionCost: variant.productionCost,
    stockQuantity: variant.stockQuantity,
    reorderLevel: variant.reorderLevel,
    stockPerUnit: variant.stockPerUnit,
  };
}

export async function createProduct(input: ProductInput) {
  return prisma.$transaction(async (tx) => {
    const [category, template] = await Promise.all([
      tx.productCategory.findFirst({
        where: { id: input.categoryId, isArchived: false },
        select: { id: true },
      }),
      input.printTemplateId
        ? tx.printTemplate.findUnique({
            where: { id: input.printTemplateId },
            select: { id: true },
          })
        : null,
    ]);
    if (!category || (input.printTemplateId && !template))
      throw new Error("INVALID_RELATION");
    return tx.product.create({
      data: {
        name: input.name,
        description: input.description,
        categoryId: category.id,
        printTemplateId: template?.id,
        variants: {
          create: input.variants.map((variant) => ({
            ...variantData(variant),
            sku: `INTERNAL-${randomUUID()}`,
          })),
        },
      },
    });
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({
      where: { id, isActive: true },
      include: { variants: true },
    });
    const category = await tx.productCategory.findFirst({
      where: { id: input.categoryId, isArchived: false },
      select: { id: true },
    });
    const template = input.printTemplateId
      ? await tx.printTemplate.findUnique({
          where: { id: input.printTemplateId },
          select: { id: true },
        })
      : null;
    if (!existing) throw new Error("NOT_FOUND");
    if (!category || (input.printTemplateId && !template))
      throw new Error("INVALID_RELATION");
    const retainedIds = input.variants.flatMap((variant) =>
      variant.id ? [variant.id] : [],
    );
    if (
      retainedIds.some(
        (variantId) =>
          !existing.variants.some((variant) => variant.id === variantId),
      )
    )
      throw new Error("INVALID_VARIANT");
    await tx.productVariant.updateMany({
      where: { productId: id, id: { notIn: retainedIds } },
      data: { isActive: false },
    });
    for (const variant of input.variants) {
      if (variant.id)
        await tx.productVariant.update({
          where: { id: variant.id },
          data: { ...variantData(variant), isActive: true },
        });
      else
        await tx.productVariant.create({
          data: {
            ...variantData(variant),
            sku: `INTERNAL-${randomUUID()}`,
            productId: id,
          },
        });
    }
    return tx.product.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        categoryId: category.id,
        printTemplateId: template?.id ?? null,
      },
    });
  });
}

export async function archiveProduct(id: string) {
  return prisma.$transaction([
    prisma.product.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    }),
    prisma.productVariant.updateMany({
      where: { productId: id },
      data: { isActive: false },
    }),
  ]);
}
