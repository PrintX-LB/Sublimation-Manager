"use client";

import { useActionState, useRef, useState } from "react";
import { clearTestOrdersAction, type ResetDevelopmentResult } from "./actions";

const initialState: ResetDevelopmentResult = { ok: false, message: "" };

export function ClearTestOrdersForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(clearTestOrdersAction, initialState);
  return (
    <div className="mt-6 border-t border-slate-800 pt-5">
      <h3 className="font-bold text-amber-300 text-sm">Clear test orders</h3>
      <p className="mt-1 text-xs text-slate-400 leading-relaxed">Removes all orders, production records, generated sheets and stored order artwork. Customers, products, templates, recipes, inventory items, current stock and settings are preserved.</p>
      {!open ? <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-bold text-amber-200 hover:bg-amber-500/10">Clear Test Orders</button> : null}
      {state.message ? <div role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-300" : "text-amber-300"}`}><p>{state.message}</p>{state.counts ? <p className="mt-1 text-xs">Removed {state.counts.orders} orders, {state.counts.printSheets} sheets, {state.counts.inventoryTransactions} inventory transactions and {state.counts.materialConsumptions} material consumptions. Customers and inventory balances were preserved.</p> : null}</div> : null}
      {open ? <form ref={formRef} action={action} autoComplete="off" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/20 p-4"><p className="text-sm font-semibold text-amber-200">This action cannot be undone.</p><p className="mt-1 text-xs text-amber-100/80">All orders, production records, generated sheets and stored order files will be removed.</p><p className="mt-2 text-xs text-emerald-200/80">Customers, products, materials, templates, recipes, current inventory quantities and settings will remain.</p><p className="mt-2 text-xs text-amber-100/80">Type exactly <strong>CLEAR TEST ORDERS</strong> to confirm.</p><input name="clearTestOrdersConfirmation" autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false} className="mt-3 w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200" /><div className="mt-3 flex gap-2"><button type="submit" disabled={pending} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Clearing…" : "Confirm clear"}</button><button type="button" onClick={() => { setOpen(false); formRef.current?.reset(); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Cancel</button></div></form> : null}
    </div>
  );
}
