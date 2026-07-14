"use client";
import type { FormEvent } from "react";

export function CancelControls({
  sheetId,
  sheetNumber,
  cancelAction,
  cancelAndReleaseAction,
}: {
  sheetId: string;
  sheetNumber: string;
  cancelAction: (formData: FormData) => void | Promise<void>;
  cancelAndReleaseAction: (formData: FormData) => void | Promise<void>;
}) {
  const confirmCancel =
    (release: boolean) => (event: FormEvent<HTMLFormElement>) => {
      if (
        !window.confirm(
          `${release ? "Cancel this sheet and release its attempts?" : "Cancel this sheet only?"}\n\n${sheetNumber}\nInventory will not be restored automatically. Historical records remain.`,
        )
      )
        event.preventDefault();
    };
  return (
    <>
      <form action={cancelAction} onSubmit={confirmCancel(false)}>
        <input type="hidden" name="sheetId" value={sheetId} />
        <button className="w-full rounded border border-rose-500/50 px-3 py-2 text-sm text-rose-200">
          Cancel Sheet Only
        </button>
      </form>
      <form action={cancelAndReleaseAction} onSubmit={confirmCancel(true)}>
        <input type="hidden" name="sheetId" value={sheetId} />
        <button className="w-full rounded border border-amber-500/50 px-3 py-2 text-sm text-amber-200">
          Cancel and Release Attempts
        </button>
      </form>
    </>
  );
}
