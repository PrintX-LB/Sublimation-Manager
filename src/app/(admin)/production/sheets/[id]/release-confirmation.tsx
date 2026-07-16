"use client";

export function ReleaseConfirmation({ sheetId, sheetNumber, status, orderSummary, action }: { sheetId: string; sheetNumber: string; status: string; orderSummary: string; action: (formData: FormData) => void | Promise<void> }) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm(`Release attempts from ${sheetNumber}?\n\nStatus: ${status}\n${orderSummary}\n\nThis returns attempts to Ready to Print. Inventory will not be restored and the historical sheet remains.`)) event.preventDefault(); }}><input type="hidden" name="sheetId" value={sheetId} /><input type="hidden" name="releaseReason" value="Released from sheet detail" /><button className="w-full rounded border border-amber-500/50 px-3 py-2 text-sm text-amber-200">Release Attempts Back to Queue</button><p className="text-xs text-slate-500">Materials are not restored automatically.</p></form>;
}
