"use client";

import { useActionState, useRef, useState } from "react";
import { resetDevelopmentDataAction, type ResetDevelopmentResult } from "./actions";

const initialState: ResetDevelopmentResult = { ok: false, message: "" };

export function ResetDevelopmentForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(resetDevelopmentDataAction, initialState);
  return (
    <div className="mt-6 border-t border-slate-800 pt-5">
      <h3 className="font-bold text-red-400 text-sm">Development utilities</h3>
      <p className="mt-1 text-xs text-red-400/80 leading-relaxed">Permanently deletes customers and orders, payments and production records, generated sheets, and all inventory/stock transaction history. Current inventory quantities and product stock balances are preserved exactly.</p>
      {!open ? <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Reset Development Data</button> : null}
      {state.message ? <div role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-300" : "text-amber-300"}`}><p>{state.message}</p>{state.counts ? <p className="mt-1 text-xs">Removed {state.counts.orders} orders, {state.counts.customers} customers, {state.counts.printSheets} sheets, {state.counts.inventoryTransactions} inventory transactions, {state.counts.stockMovements} stock movements and {state.counts.materialConsumptions} material consumptions. Inventory balances were preserved.</p> : null}</div> : null}
      {open ? <form ref={formRef} action={action} autoComplete="off" className="mt-3 rounded-lg border border-red-500/40 bg-red-950/20 p-4"><p className="text-sm font-semibold text-red-200">This action cannot be undone.</p><p className="mt-1 text-xs text-red-200/80">It deletes customers and orders, payments and production records, generated sheets, and all inventory/stock transaction history.</p><p className="mt-2 text-xs text-emerald-200/80">It preserves current inventory quantities, product stock, products, materials and supplies, categories, templates, recipes, configured costs, metadata and settings.</p><p className="mt-2 text-xs text-red-200/80">Type exactly <strong>RESET PRINTX DATA</strong> to confirm.</p><input name="resetDevelopmentConfirmation" autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false} className="mt-3 w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200" /><div className="mt-3 flex gap-2"><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Resetting…" : "Confirm reset"}</button><button type="button" onClick={() => { setOpen(false); formRef.current?.reset(); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Cancel</button></div></form> : null}
    </div>
  );
}
