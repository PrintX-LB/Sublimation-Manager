import Link from "next/link";
import { FileImage, Plus } from "lucide-react";
import { WorkflowHeader } from "@/components/admin/workflow-header";
import {
  PrintSheetsWorkspaceNav,
  type PrintSheetsView,
} from "@/components/production/print-sheets-workspace-nav";
import { prisma } from "@/lib/db/prisma";
import { printSheetFileExists } from "@/lib/print-sheet-library";
import { orderItemReference } from "@/lib/orders/item-reference";
import { ManualSheetBuilderContent } from "../sheet-builder/content";
import { AutomaticPairingContent } from "./queue/content";
import { DeleteSheetButton } from "./delete-sheet-button";
import { deleteGeneratedPrintSheetAction } from "./actions";
import { BatchPrintButton } from "./batch-print-button";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const badge: Record<string, string> = {
  READY_TO_PRINT: "bg-amber-500/15 text-amber-200",
  PRINTED: "bg-emerald-500/15 text-emerald-200",
  CANCELLED: "bg-rose-500/15 text-rose-200",
  SUPERSEDED: "bg-slate-700 text-slate-300",
  GENERATED: "bg-sky-500/15 text-sky-200",
  ERROR: "bg-rose-500/15 text-rose-200",
};

type WorkspaceParams = {
  view?: string;
  q?: string;
  status?: string;
  page?: string;
  created?: string;
  generated?: string;
  reset?: string;
  paperSize?: string;
};

function workspaceView(value?: string): PrintSheetsView {
  return value === "manual" || value === "automatic" || value === "history"
    ? value
    : "automatic";
}

async function GeneratedSheetHistory({ params }: { params: WorkspaceParams }) {
  const q = params.q?.trim() ?? "";
  const status = params.status ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 25;
  const returnToParams = new URLSearchParams({ view: "history" });
  if (q) returnToParams.set("q", q);
  if (status) returnToParams.set("status", status);
  if (page > 1) returnToParams.set("page", String(page));
  const returnTo = `/production/sheets?${returnToParams.toString()}`;
  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { sheetNumber: { contains: q } },
            { filename: { contains: q } },
            {
              slots: {
                some: { order: { orderNumber: { contains: q } } },
              },
            },
            {
              slots: {
                some: {
                  order: { customer: { fullName: { contains: q } } },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [sheets, total] = await prisma.$transaction([
    prisma.printSheet.findMany({
      where,
      include: {
        slots: { include: { order: { include: { customer: true } }, orderItem: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.printSheet.count({ where }),
  ]);
  const rows = await Promise.all(
    sheets.map(async (sheet) => ({
      sheet,
      available: await printSheetFileExists(sheet.storagePath),
    })),
  );

  const readyToPrint = rows.filter(
    ({ sheet, available }) => sheet.status === "READY_TO_PRINT" && available,
  ).map(({ sheet }) => ({ id: sheet.id, storagePath: sheet.storagePath }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="view" value="history" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search sheet, order or customer"
            className="h-10 w-72 rounded border border-slate-700 bg-slate-900 px-3 text-sm"
          />
          <select
            name="status"
            defaultValue={status}
            className="h-10 rounded border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            <option value="">All statuses</option>
            {[
              "READY_TO_PRINT",
              "PRINTED",
              "CANCELLED",
              "SUPERSEDED",
              "ERROR",
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button className="h-10 rounded bg-slate-700 px-4 text-sm">
            Filter
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <BatchPrintButton sheets={readyToPrint} />
          <Link
            href="/production/sheets?view=manual"
            className="inline-flex h-10 items-center gap-2 rounded bg-emerald-600 px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Create sheet
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/70">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Sheet</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sheet, available }) => (
              <tr
                key={sheet.id}
                className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/production/sheets/${sheet.id}?returnTo=${encodeURIComponent(returnTo)}`}
                    className="text-brand-200 flex items-center gap-2 font-semibold hover:underline"
                  >
                    <FileImage size={16} />
                    {sheet.sheetNumber ?? "Legacy sheet"}
                  </Link>
                  <p className="text-xs text-slate-500">{sheet.filename}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {Array.from(
                      new Map(
                        sheet.slots.map((slot) => [
                          slot.id,
                          orderItemReference(slot.order.orderNumber, slot.orderItem?.itemSequence ?? 1),
                        ]),
                      ).values(),
                    ).map((number) => (
                      <span
                        key={number}
                        className="rounded bg-slate-800 px-2 py-1 text-xs"
                      >
                        {number}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {sheet.createdAt.toLocaleString("en-GB")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${badge[sheet.status] ?? badge.GENERATED}`}
                  >
                    {sheet.status.replaceAll("_", " ")}
                  </span>
                  {sheet.printedAt ? (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Printed {sheet.printedAt.toLocaleString("en-GB")}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {sheet.widthPx > 3000 || sheet.heightPx > 4000 ? "A3" : "A4"} · {sheet.widthPx}×{sheet.heightPx} · {sheet.dpi} DPI
                </td>
                <td
                  className={`px-4 py-3 text-xs ${available ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {available ? "Available" : "Missing"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/production/sheets/${sheet.id}?returnTo=${encodeURIComponent(returnTo)}`}
                    className="rounded border border-slate-700 px-3 py-1.5 text-xs"
                  >
                    Open
                  </Link>
                  {available ? (
                    <PrintButton
                      sheetId={sheet.id}
                      storagePath={sheet.storagePath}
                      alreadyPrinted={sheet.status === "PRINTED"}
                    />
                  ) : null}
                  <DeleteSheetButton
                    sheetId={sheet.id}
                    sheetLabel={sheet.sheetNumber ?? sheet.filename}
                    action={deleteGeneratedPrintSheetAction}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No generated sheets found.
          </p>
        ) : null}
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
          <span>
            {total} sheet{total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`?view=history&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page - 1}`}
                className="rounded border border-slate-700 px-3 py-1"
              >
                Previous
              </Link>
            ) : null}
            {page * pageSize < total ? (
              <Link
                href={`?view=history&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page + 1}`}
                className="rounded border border-slate-700 px-3 py-1"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function PrintSheetsPage({
  searchParams,
}: {
  searchParams: Promise<WorkspaceParams>;
}) {
  const params = await searchParams;
  const view = workspaceView(params.view);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <WorkflowHeader
        title="Print Sheets"
        description="Create, pair, and manage physical print sheets from one production workspace."
        backLabel="Back to Production"
        fallbackRoute="/production"
      />
      <PrintSheetsWorkspaceNav active={view} />

      {view === "manual" ? (
        <ManualSheetBuilderContent params={params} />
      ) : null}
      {view === "automatic" ? (
        <AutomaticPairingContent params={params} />
      ) : null}
      {view === "history" ? <GeneratedSheetHistory params={params} /> : null}
    </div>
  );
}
