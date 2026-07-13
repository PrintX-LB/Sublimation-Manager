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
    <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="orderId" value={orderId} />
      <input
        name="amount"
        placeholder="Amount"
        className="rounded-xl border px-3 py-2 text-sm"
      />
      <select name="method" className="rounded-xl border px-3 py-2 text-sm">
        <option value="cash">Cash</option>
        <option value="card">Card</option>
        <option value="bank_transfer">Bank transfer</option>
        <option value="other">Other</option>
      </select>
      <input
        name="reference"
        placeholder="Reference (optional)"
        className="rounded-xl border px-3 py-2 text-sm"
      />
      <button
        disabled={pending}
        className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
      >
        Record payment
      </button>
      {state.message ? (
        <p role="status" className="text-sm text-slate-600 sm:col-span-4">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
