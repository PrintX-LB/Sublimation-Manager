"use client";
import { useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { batchMarkSheetsPrintedAction } from "./actions";

export function BatchPrintButton({
  sheets,
}: {
  sheets: { id: string; storagePath: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (!sheets.length) return null;

  function handleClick() {
    // Open each PDF in a new window
    for (const sheet of sheets) {
      window.open(
        `/api/local-files?path=${encodeURIComponent(sheet.storagePath)}`,
        "_blank",
      );
    }
    // Mark them all as PRINTED via server action
    startTransition(async () => {
      const formData = new FormData();
      formData.set("sheetIds", sheets.map((s) => s.id).join(","));
      await batchMarkSheetsPrintedAction(formData);
      setDone(true);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending || done}
      className="inline-flex h-10 items-center gap-2 rounded bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      <Printer size={15} />
      {isPending
        ? "Marking printed…"
        : done
          ? `Printed ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} ✓`
          : `Print All Ready (${sheets.length})`}
    </button>
  );
}
