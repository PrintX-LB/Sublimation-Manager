"use client";

import { Trash2 } from "lucide-react";

export function DeleteSheetButton({
  sheetId,
  sheetLabel,
  action,
}: {
  sheetId: string;
  sheetLabel: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete generated sheet "${sheetLabel}" from history? Inventory and material history will be preserved.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="sheetId" value={sheetId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded border border-rose-500/50 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10"
        aria-label={`Delete ${sheetLabel}`}
      >
        <Trash2 size={14} /> Delete
      </button>
    </form>
  );
}
