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
      <p className="mt-1 text-xs text-red-400/80 leading-relaxed">Permanently deletes customers, orders, payments, production history, generated sheets and inventory transaction history. Products, variants, categories, templates, recipes, inventory quantities and settings are preserved.</p>
      {!open ? <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Reset Development Data</button> : null}
      {state.message ? <p role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-300" : "text-amber-300"}`}>{state.message}{state.counts ? ` Removed ${state.counts.orders} orders and ${state.counts.customers} customers.` : ""}</p> : null}
      {open ? <form ref={formRef} action={action} autoComplete="off" className="mt-3 rounded-lg border border-red-500/40 bg-red-950/20 p-4"><p className="text-sm font-semibold text-red-200">This action cannot be undone.</p><p className="mt-1 text-xs text-red-200/80">Type exactly <strong>RESET PRINTX DATA</strong> to confirm.</p><input name="resetDevelopmentConfirmation" autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false} className="mt-3 w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200" /><div className="mt-3 flex gap-2"><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Resetting…" : "Confirm reset"}</button><button type="button" onClick={() => { setOpen(false); formRef.current?.reset(); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Cancel</button></div></form> : null}
    </div>
  );
}
