/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import path from "node:path";
import { WorkflowHeader } from "@/components/admin/workflow-header";
import { prisma } from "@/lib/db/prisma";
import { orderItemReference } from "@/lib/orders/item-reference";
import { printSheetFileExists } from "@/lib/print-sheet-library";
import {
  cancelPrintSheetAction,
  cancelPrintSheetAndReleaseAction,
  deleteGeneratedPrintSheetAction,
  markPrintSheetPrintedAction,
  recreatePrintSheetFileAction,
  regeneratePhysicalPrintSheetAction,
  releaseAttemptsBackToQueueAction,
} from "../actions";
import { ReleaseConfirmation } from "./release-confirmation";
import { CancelControls } from "./cancel-controls";
import { DeleteSheetButton } from "../delete-sheet-button";

export const dynamic = "force-dynamic";
const money = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`;
export default async function PrintSheetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const sheet = await prisma.printSheet.findUnique({
    where: { id },
    include: {
      slots: {
        include: {
          order: { include: { customer: true } },
          orderItem: true,
          productionAttempt: true,
          artworkVersion: true,
        },
      },
      materialConsumptions: { include: { recipeItem: true } },
      events: { orderBy: { createdAt: "asc" } },
      sourceSheet: true,
      regenerations: true,
    },
  });
  if (!sheet) notFound();
  const available = await printSheetFileExists(sheet.storagePath);
  const isPdf = path.extname(sheet.storagePath).toLowerCase() === ".pdf";
  const fileUrl = `/api/local-files?path=${encodeURIComponent(sheet.storagePath)}`;
  const orders = Array.from(
    new Map(sheet.slots.map((slot) => [slot.orderId, slot.order])).values(),
  );
  const activeSlots = sheet.slots.filter(
    (slot) => slot.assignmentState === "ACTIVE" && slot.productionAttemptId,
  );
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <WorkflowHeader
        title={sheet.sheetNumber ?? "Generated Print Sheet"}
        description={sheet.filename}
        backLabel="Back to Sheet Library"
        fallbackRoute="/production/sheets"
      />
      {query.saved ? (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Sheet updated successfully.
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-5">
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="flex min-h-[520px] items-center justify-center rounded-lg bg-slate-950 p-4">
              {available && isPdf ? (
                <iframe src={fileUrl} title={`${sheet.filename} PDF preview`} className="h-[620px] w-full rounded border-0" />
              ) : (
                <img
                  src={available ? fileUrl : "/branding/printx-sidebar-wordmark.png"}
                  alt={available ? sheet.filename : "Print sheet file missing"}
                  className="max-h-[620px] max-w-full object-contain"
                />
              )}
            </div>
            {!available ? (
              <p className="mt-3 text-sm text-rose-300">
                The generated file is missing. The database record is preserved;
                use Recreate File if the source is available.
              </p>
            ) : null}
          </div>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="font-semibold">Slots and linked production</h2>
            <div className="mt-3 space-y-3">
              {sheet.slots.map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-lg border border-slate-800 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      Slot {slot.slotNumber} · {orderItemReference(slot.order.orderNumber, slot.orderItem?.itemSequence ?? 1)}
                    </span>
                    <Link
                      href={`/orders/${slot.orderId}`}
                      className="text-brand-200 text-xs"
                    >
                      Open order
                    </Link>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    {slot.order.customer.fullName} ·{" "}
                    {slot.orderItem?.productNameSnapshot ?? "Artwork"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Artwork version {slot.artworkVersion.version}
                    {slot.productionAttempt
                      ? ` · Attempt ${slot.productionAttempt.attemptNumber}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="font-semibold">Assignment history</h2>
            <div className="mt-3 space-y-2 text-xs">
              {sheet.slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`rounded border p-2 ${slot.assignmentState === "ACTIVE" ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800"}`}
                >
                  <div className="flex justify-between gap-2">
                    <span>
                      Slot {slot.slotNumber} ·{" "}
                      {slot.productionAttempt
                      ? `${orderItemReference(slot.order.orderNumber, slot.orderItem?.itemSequence ?? 1)} · Attempt ${slot.productionAttempt.attemptNumber}`
                        : "Artwork-only assignment"}
                    </span>
                    <span>{slot.assignmentState}</span>
                  </div>
                  <p className="mt-1 text-slate-500">
                    Assigned {slot.assignedAt.toLocaleString("en-GB")}
                    {slot.releasedAt
                      ? ` · Released ${slot.releasedAt.toLocaleString("en-GB")}`
                      : ""}
                  </p>
                  {slot.releaseReason ? (
                    <p className="mt-1 text-slate-500">{slot.releaseReason}</p>
                  ) : null}
                  {slot.supersedingSheetId ? (
                    <p className="mt-1 text-slate-500">
                      Superseded by a regenerated sheet
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </section>
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Sheet status</h2>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-xs">
                {sheet.status.replaceAll("_", " ")}
              </span>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd>{sheet.createdAt.toLocaleString("en-GB")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Printed</dt>
                <dd>
                  {sheet.printedAt?.toLocaleString("en-GB") ?? "Not printed"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Dimensions</dt>
                <dd>
                  {sheet.widthPx}×{sheet.heightPx} · {sheet.dpi} DPI
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Cut marks</dt>
                <dd>{sheet.cutMarkMode === "CORNER_MARKS" ? "Corner marks" : sheet.cutMarkMode === "NONE" ? "None" : "Full outline"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">File</dt>
                <dd
                  className={available ? "text-emerald-300" : "text-rose-300"}
                >
                  {available ? "Available" : "Missing"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="font-semibold">Actions</h2>
            {available ? (
              <a
                href={fileUrl}
                download
                className="block w-full rounded bg-emerald-600 px-3 py-2 text-center text-sm font-semibold"
              >
                Download
              </a>
            ) : null}
            {available ? (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="block w-full rounded border border-emerald-500/50 px-3 py-2 text-center text-sm font-semibold text-emerald-200">
                Print PDF
              </a>
            ) : null}
            {isPdf ? <p className="text-xs text-slate-500">In the browser PDF viewer, choose Actual Size / 100% and disable Fit to page.</p> : null}
            {sheet.status !== "PRINTED" && sheet.status !== "CANCELLED" ? (
              <form action={markPrintSheetPrintedAction}>
                <input type="hidden" name="sheetId" value={sheet.id} />
                <button className="w-full rounded border border-emerald-500/50 px-3 py-2 text-sm text-emerald-200">
                  Mark as Printed
                </button>
              </form>
            ) : null}
            {sheet.status !== "PRINTED" && sheet.status !== "CANCELLED" ? (
              <CancelControls
                sheetId={sheet.id}
                sheetNumber={sheet.sheetNumber ?? "Generated sheet"}
                cancelAction={cancelPrintSheetAction}
                cancelAndReleaseAction={cancelPrintSheetAndReleaseAction}
              />
            ) : null}
            {sheet.status === "PRINTED" ? (
              <p className="rounded border border-slate-700 p-2 text-xs text-slate-400">
                Use Record Incident &amp; Reprint to replace attempts from a
                printed sheet.
              </p>
            ) : null}
            {activeSlots.length && sheet.status !== "PRINTED" ? (
              <ReleaseConfirmation
                sheetId={sheet.id}
                sheetNumber={sheet.sheetNumber ?? "Generated sheet"}
                status={sheet.status}
                orderSummary={orders
                  .map((order) => order.orderNumber)
                  .join(", ")}
                action={releaseAttemptsBackToQueueAction}
              />
            ) : null}
            {!available ? (
              <form action={recreatePrintSheetFileAction}>
                <input type="hidden" name="sheetId" value={sheet.id} />
                <button className="w-full rounded border border-amber-500/50 px-3 py-2 text-sm text-amber-200">
                  Recreate File
                </button>
              </form>
            ) : null}
            <form action={regeneratePhysicalPrintSheetAction}>
              <input type="hidden" name="sheetId" value={sheet.id} />
              <input
                type="hidden"
                name="regenerationRequestKey"
                value={`physical:${sheet.id}:${sheet.updatedAt.toISOString()}`}
              />
              <button className="w-full rounded border border-slate-600 px-3 py-2 text-sm">
                Regenerate Physical Sheet
              </button>
            </form>
            <DeleteSheetButton
              sheetId={sheet.id}
              sheetLabel={sheet.sheetNumber ?? sheet.filename}
              action={deleteGeneratedPrintSheetAction}
            />
            <p className="text-xs text-slate-500">
              Regeneration creates a new sheet record. It does not reverse the
              original consumption.
            </p>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="font-semibold">Material consumption</h2>
            {!sheet.materialConsumptions.some(
              (consumption) =>
                consumption.materialRoleSnapshot === "PRINT_MEDIA",
            ) ? (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200">
                No physical paper is linked to this sheet. Check that each
                compatible product variant has one PRINT_MEDIA item configured
                as 1 whole unit at PRINT_SHEET_GENERATION.
              </div>
            ) : null}
            {sheet.materialConsumptions.length ? (
              <div className="mt-3 space-y-2 text-xs">
                {sheet.materialConsumptions.map((consumption) => (
                  <div
                    key={consumption.id}
                    className="flex justify-between gap-2"
                  >
                    <span>
                      {consumption.materialNameSnapshot} · {consumption.status}
                    </span>
                    <span>
                      {money(consumption.quantity.mul(consumption.unitCost))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                No linked material consumption.
              </p>
            )}
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="font-semibold">History</h2>
            <div className="mt-3 space-y-3">
              {sheet.events.map((event) => (
                <div
                  key={event.id}
                  className="border-l-2 border-slate-700 pl-3"
                >
                  <p className="text-sm">
                    {event.eventType.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.createdAt.toLocaleString("en-GB")}
                    {event.note ? ` · ${event.note}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="font-semibold">Linked orders</h2>
            <div className="mt-2 space-y-1 text-sm">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="text-brand-200 block hover:underline"
                >
                  {order.orderNumber} · {order.customer.fullName}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
