import { prisma } from "@/lib/db/prisma";
import { SHEET_LAYOUT, mmToPixels } from "@/lib/production-sheet";
import { SheetBuilderForm } from "./sheet-builder-form";

export const dynamic = "force-dynamic";

export async function ManualSheetBuilderContent({
  params,
}: {
  params: { q?: string; created?: string };
}) {
  const search = params.q?.trim() ?? "";

  // Load compatible artwork versions
  const versions = await prisma.artworkVersion.findMany({
    where: {
      project: {
        orderItem: {
          order: {
            status: { not: "Cancelled" },
            customer: search ? { fullName: { contains: search } } : undefined,
          },
        },
      },
    },
    include: {
      printSheetSlots: {
        include: {
          sheet: true,
        },
      },
      project: {
        include: {
          template: true,
          orderItem: {
            include: {
              order: {
                include: {
                  customer: true,
                },
              },
              productVariant: { include: { product: { include: { printTemplate: true } } } },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  const compatibleVersions = versions.filter((version) => {
    const template = version.project.template ?? version.project.orderItem.productVariant?.product.printTemplate;
    if (!template) return false;
    return version.widthPx === mmToPixels(Number(template.widthMm), template.dpi) && version.heightPx === mmToPixels(Number(template.heightMm), template.dpi) && version.widthPx <= SHEET_LAYOUT.designWidthPx && version.heightPx <= SHEET_LAYOUT.designHeightPx;
  });

  // Load created sheet if redirect parameter is present
  let createdSheet = null;
  if (params.created) {
    createdSheet = await prisma.printSheet.findUnique({
      where: { id: params.created },
    });
  }

  // Convert Decimal models to plain numbers/strings to satisfy Next.js client component boundary serialization
  const serializedVersions = compatibleVersions.map((v) => ({
    id: v.id,
    version: v.version,
    editedPath: v.editedPath,
    printReadyPath: v.printReadyPath,
    widthPx: v.widthPx,
    heightPx: v.heightPx,
    createdAt: v.createdAt.toISOString(),
    printSheetSlots: v.printSheetSlots.map((s) => ({ id: s.id })),
    project: {
      orderItem: {
        id: v.project.orderItem.id,
        productNameSnapshot: v.project.orderItem.productNameSnapshot,
        itemSequence: v.project.orderItem.itemSequence,
        productVariant: v.project.orderItem.productVariant
          ? { name: v.project.orderItem.productVariant.name }
          : null,
        orderId: v.project.orderItem.orderId,
        order: {
          orderNumber: v.project.orderItem.order.orderNumber,
          status: v.project.orderItem.order.status,
          dueDate: v.project.orderItem.order.dueDate
            ? v.project.orderItem.order.dueDate.toISOString()
            : null,
          customer: {
            fullName: v.project.orderItem.order.customer.fullName,
          },
        },
      },
    },
  }));

  return (
    <SheetBuilderForm
      initialVersions={serializedVersions}
      createdId={createdSheet?.id}
      createdStoragePath={createdSheet?.storagePath}
    />
  );
}
