"use client";
import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms/state";
export function PaymentForm({
  action,
  orderId,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  orderId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="mt-5 grid grid-cols-1 gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input
        name="amount"
        aria-label="Payment amount"
        placeholder="Amount"
        className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100"
      />
      <select name="method" aria-label="Payment method" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100">
        <option value="cash">Cash</option>
        <option value="card">Card</option>
        <option value="bank_transfer">Bank transfer</option>
        <option value="other">Other</option>
      </select>
      <input
        name="reference"
        aria-label="Payment reference"
        placeholder="Reference (optional)"
        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      />
      <button
        disabled={pending}
        className="h-10 w-full whitespace-nowrap rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500"
      >
        Record payment
      </button>
      {state.message ? (
        <p role="status" className="text-sm text-slate-400">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
