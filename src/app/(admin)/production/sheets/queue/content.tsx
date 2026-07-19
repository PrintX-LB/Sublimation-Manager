import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { SHEET_LAYOUT, mmToPixels } from "@/lib/production-sheet";
import {
  suggestGroups,
  templateCompatibilityKey,
  type PairingAttempt,
} from "@/lib/production/sheet-pairing";
import { generateAllQueueSheetsAction, generateQueueSheetAction } from "./actions";
import { PairDraftEditor } from "./pair-draft-editor";
import { orderItemReference } from "@/lib/orders/item-reference";

export const dynamic = "force-dynamic";
const artworkVersionFor = (item: {
  artworkProject: {
    activeVersionId: string | null;
    versions: Array<{
      id: string;
      printReadyPath: string;
      editedPath: string;
      widthPx: number;
      heightPx: number;
    }>;
  } | null;
}) =>
  item.artworkProject?.versions.find(
    (version) => version.id === item.artworkProject?.activeVersionId,
  ) ?? item.artworkProject?.versions[0];

export async function AutomaticPairingContent({
  params,
}: {
  params: { generated?: string };
}) {
  const attempts = await prisma.productionAttempt.findMany({
    where: {
      status: "Ready to Print",
      failedIncident: null,
      replacementIncident: null,
      orderItem: { order: { status: { not: "Cancelled" } } },
    },
    include: {
      orderItem: {
        include: {
          printSheetSlots: { include: { sheet: true } },
          order: { select: { id: true, orderNumber: true, status: true, dueDate: true, priority: true, customer: { select: { fullName: true } } } },
          productVariant: { select: { name: true, product: { select: { printTemplate: { select: { name: true, widthMm: true, heightMm: true, dpi: true, cutMarkMode: true } } } } } },
          artworkProject: {
            include: {
              template: { select: { name: true, widthMm: true, heightMm: true, dpi: true, cutMarkMode: true } },
              versions: { orderBy: { version: "desc" }, select: { id: true, printReadyPath: true, editedPath: true, widthPx: true, heightPx: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const eligible: PairingAttempt[] = [];
  const blocked: Array<{ id: string; orderNumber: string; itemSequence: number; reason: string }> = [];
  for (const attempt of attempts) {
    const activeSlotCount = attempt.orderItem.printSheetSlots.filter(
      (slot) =>
        slot.assignmentState === "ACTIVE" &&
        !["CANCELLED", "SUPERSEDED"].includes(slot.sheet.status),
    ).length;
    const itemQuantity = Math.max(1, attempt.orderItem.quantity);
    if (activeSlotCount >= itemQuantity) continue;
    const version = artworkVersionFor(attempt.orderItem);
    const template =
      attempt.orderItem.artworkProject?.template ??
      attempt.orderItem.productVariant?.product.printTemplate;
    if (!version) {
      blocked.push({ id: attempt.id, orderNumber: attempt.orderItem.order.orderNumber, itemSequence: attempt.orderItem.itemSequence, reason: "No artwork version is available." });
      continue;
    }
    if (!template) {
      blocked.push({ id: attempt.id, orderNumber: attempt.orderItem.order.orderNumber, itemSequence: attempt.orderItem.itemSequence, reason: "No print template is linked." });
      continue;
    }
    const widthPx = mmToPixels(Number(template.widthMm), template.dpi);
    const heightPx = mmToPixels(Number(template.heightMm), template.dpi);
    if (widthPx < 1 || heightPx < 1 || widthPx > SHEET_LAYOUT.designWidthPx || heightPx > SHEET_LAYOUT.designHeightPx) {
      blocked.push({ id: attempt.id, orderNumber: attempt.orderItem.order.orderNumber, itemSequence: attempt.orderItem.itemSequence, reason: `Template is ${template.widthMm}×${template.heightMm} mm and is larger than the available A4 transfer slot.` });
      continue;
    }
    if (version.widthPx !== widthPx || version.heightPx !== heightPx) {
      blocked.push({ id: attempt.id, orderNumber: attempt.orderItem.order.orderNumber, itemSequence: attempt.orderItem.itemSequence, reason: `Artwork is ${version.widthPx}×${version.heightPx}px but the selected template requires ${widthPx}×${heightPx}px.` });
      continue;
    }
    const settings = attempt.orderItem.artworkProject?.settingsJson
      ? (JSON.parse(attempt.orderItem.artworkProject.settingsJson) as {
          contourEnabled?: boolean;
        })
      : {};
    const baseCandidate = {
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      createdAt: attempt.createdAt,
      orderNumber: attempt.orderItem.order.orderNumber,
      itemSequence: attempt.orderItem.itemSequence,
      orderId: attempt.orderItem.orderId,
      orderItemId: attempt.orderItemId,
      customerName: attempt.orderItem.order.customer.fullName,
      productName: attempt.orderItem.productNameSnapshot,
      variantName: attempt.orderItem.productVariant?.name ?? "Standard",
      dueDate: attempt.orderItem.order.dueDate,
      priority: attempt.orderItem.order.priority,
      artworkVersionId: version.id,
      artworkPath: version.printReadyPath || version.editedPath,
      templateName: template.name,
      compatibilityKey: templateCompatibilityKey({
        name: template.name,
        widthMm: Number(template.widthMm),
        heightMm: template.heightMm,
        dpi: template.dpi,
        contour: settings.contourEnabled,
        cutMarkMode: settings.contourEnabled ? template.cutMarkMode : "NONE",
      }),
      assigned: false,
    };
    const remainingCount = itemQuantity - activeSlotCount;
    if (remainingCount > 0) {
      eligible.push({
        ...baseCandidate,
        id: attempt.id,
        sourceAttemptId: attempt.id,
        remainingCount,
      });
    }
  }
  const { groups, unpaired } = suggestGroups(eligible, (item) => item.compatibilityKey.includes("_2362X1063_") ? 3 : 2);
  const fullSheets = groups.length;
  const totalSheets = fullSheets + unpaired.length;
  const urgentCount = eligible.filter((item) => item.priority === "Urgent").length;
  const overdueCount = eligible.filter((item) => item.dueDate && item.dueDate < new Date()).length;
  const generationBatches = [
    ...groups.map((group) => ({ attempt1: group[0]!.id, attempt2: group[1]?.id, attempt3: group[2]?.id })),
    ...unpaired.map((item) => ({ attempt1: item.id })),
  ];
  const card = (item: PairingAttempt) => (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/orders/${item.orderId}`}
            className="text-brand-200 font-semibold hover:underline"
          >
            {orderItemReference(item.orderNumber, item.itemSequence ?? 1)}{item.remainingCount && item.remainingCount > 1 ? ` (x${item.remainingCount})` : ""}
          </Link>
          <p className="text-sm text-slate-300">{item.customerName}</p>
        </div>
        <span className="rounded bg-slate-800 px-2 py-1 text-[11px]">
          {item.priority}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {item.productName} · {item.variantName} · Attempt {item.attemptNumber}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {item.dueDate
          ? `Due ${item.dueDate.toLocaleDateString("en-GB")}`
          : "No due date"}{" "}
        · {item.templateName}
      </p>
      <div className="mt-2 flex gap-2 text-[11px]">
        <Link
          href={`/orders/${item.orderId}/items/${item.orderItemId ?? item.id}/artwork`}
          className="text-brand-200"
        >
          Open artwork
        </Link>
      </div>
    </div>
  );
  return (
    <div className="space-y-5">
      {params.generated ? (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Physical sheet generated. The assigned attempts have been removed from
          this queue.
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/production/sheets?view=automatic"
          className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300"
        >
          Refresh queue
        </Link>
        <Link href="/production/sheets?view=automatic&reset=1" className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300">Reset Suggestions</Link>
        {generationBatches.length ? <form action={generateAllQueueSheetsAction}><input type="hidden" name="batch" value={JSON.stringify(generationBatches)} /><input type="hidden" name="generationRequestKey" value={randomUUID()} /><button className="rounded bg-brand-600 px-3 py-2 text-xs font-semibold text-white">Generate all sheets ({generationBatches.length})</button></form> : null}
      </div>
      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-2 text-xs">
        <div className="min-w-[120px] flex-1 rounded-lg bg-slate-950/50 px-3 py-2">
          <p className="text-xs text-slate-500">Eligible transfers</p>
          <p className="mt-0.5 text-xl font-semibold">{eligible.length}</p>
        </div>
        <div className="min-w-[120px] flex-1 rounded-lg bg-slate-950/50 px-3 py-2">
          <p className="text-xs text-slate-500">Suggested full sheets</p>
          <p className="mt-0.5 text-xl font-semibold">{fullSheets}</p>
        </div>
        <div className="min-w-[120px] flex-1 rounded-lg bg-slate-950/50 px-3 py-2">
          <p className="text-xs text-slate-500">Unpaired</p>
          <p className="mt-0.5 text-xl font-semibold">{unpaired.length}</p>
        </div>
        <div className="min-w-[120px] flex-1 rounded-lg bg-slate-950/50 px-3 py-2">
          <p className="text-xs text-slate-500">Sheets if all generated</p>
          <p className="mt-0.5 text-xl font-semibold">{totalSheets}</p>
        </div>
        <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">Urgent {urgentCount}</div>
        <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-rose-200">Overdue {overdueCount}</div>
      </section>
      {blocked.length ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="font-semibold text-amber-200">Ready to Print — needs attention</h2>
          <p className="mt-1 text-xs text-amber-100/70">These orders are ready, but cannot be placed on an A4 mug sheet until their artwork or template is corrected.</p>
          <div className="mt-3 space-y-2">
            {blocked.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-500/20 px-3 py-2 text-xs">
                <span className="font-semibold text-amber-100">{orderItemReference(item.orderNumber, item.itemSequence)}</span>
                <span className="text-amber-100/80">{item.reason}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr_320px]">
        <section className="space-y-3">
          <h2 className="font-semibold">Eligible transfers</h2>
          {eligible.length ? (
            eligible.map((item) => <div key={item.id}>{card(item)}</div>)
          ) : (
            <p className="rounded border border-slate-700 p-6 text-sm text-slate-500">
              No compatible Ready to Print attempts are waiting.
            </p>
          )}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Suggested sheets</h2>
          {groups.length ? (
            groups.map((group) => (
              <PairDraftEditor key={group.map((item) => item.id).join("-")} slots={group} maxSlots={group[0]!.compatibilityKey.includes("_2362X1063_") ? 3 : 2} candidates={eligible} generateAction={generateQueueSheetAction} />
            ))
          ) : (
            <p className="rounded border border-slate-700 p-6 text-sm text-slate-500">
              No full sheets available.
            </p>
          )}
        </section>
        <aside className="space-y-3">
          <h2 className="font-semibold">Unpaired transfers</h2>
          {unpaired.length ? (
            unpaired.map((item) => (
              <form
                key={item.id}
                action={generateQueueSheetAction}
                className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
              >
                {card(item)}
                <input type="hidden" name="attempt1" value={item.id} />
                <input
                  type="hidden"
                  name="generationRequestKey"
                  value={randomUUID()}
                />
                <p className="text-xs text-amber-200">
                  A one-slot sheet still consumes one physical A4 sheet.
                </p>
                <button className="w-full rounded border border-amber-500/50 px-3 py-2 text-sm text-amber-200">
                  Generate One-Slot Sheet
                </button>
              </form>
            ))
          ) : (
            <p className="rounded border border-slate-700 p-6 text-sm text-slate-500">
              All eligible transfers are paired.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
