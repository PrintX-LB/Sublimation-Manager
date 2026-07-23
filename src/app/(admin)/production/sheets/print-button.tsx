"use client";
import { useTransition } from "react";
import { Printer } from "lucide-react";
import { markSingleSheetPrintedAction } from "./actions";

export function PrintButton({
  sheetId,
  storagePath,
  alreadyPrinted,
}: {
  sheetId: string;
  storagePath: string;
  alreadyPrinted: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    window.open(
      `/api/local-files?path=${encodeURIComponent(storagePath)}`,
      "_blank",
    );
    if (!alreadyPrinted) {
      startTransition(async () => {
        const formData = new FormData();
        formData.set("sheetId", sheetId);
        await markSingleSheetPrintedAction(formData);
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`ml-2 inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
        alreadyPrinted
          ? "border-slate-600 text-slate-400 hover:border-slate-500"
          : "border-emerald-500/40 text-emerald-200 hover:border-emerald-400"
      }`}
    >
      <Printer size={11} />
      {alreadyPrinted ? "Print again" : "Print"}
    </button>
  );
}
