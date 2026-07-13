import { PageHeading } from "@/components/admin/page-heading";
import { prisma } from "@/lib/db/prisma";
import { SHEET_LAYOUT } from "@/lib/production-sheet";
import { SheetBuilderForm } from "./sheet-builder-form";

export const dynamic = "force-dynamic";

export default async function SheetBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; created?: string }>;
}) {
  const params = await searchParams;
  const search = params.q?.trim() ?? "";

  // Load compatible artwork versions
  const versions = await prisma.artworkVersion.findMany({
    where: {
      widthPx: SHEET_LAYOUT.designWidthPx,
      heightPx: SHEET_LAYOUT.designHeightPx,
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
          orderItem: {
            include: {
              order: {
                include: {
                  customer: true,
                },
              },
              productVariant: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Load created sheet if redirect parameter is present
  let createdSheet = null;
  if (params.created) {
    createdSheet = await prisma.printSheet.findUnique({
      where: { id: params.created },
    });
  }

  // Convert Decimal models to plain numbers/strings to satisfy Next.js client component boundary serialization
  const serializedVersions = versions.map((v) => ({
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
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeading
        title="Print Sheet Builder"
        description="Combine two compatible mug transfers from any orders onto one A4 sheet."
      />

      <SheetBuilderForm
        initialVersions={serializedVersions}
        createdId={createdSheet?.id}
        createdStoragePath={createdSheet?.storagePath}
      />
    </div>
  );
}
