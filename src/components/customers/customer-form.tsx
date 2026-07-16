"use client";

import { useActionState } from "react";
import type { Customer } from "@prisma/client";
import { initialFormState, type FormState } from "@/lib/forms/state";

type CustomerDefaults = Pick<
  Customer,
  | "fullName"
  | "phone"
  | "email"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "postcode"
  | "country"
  | "deliveryNotes"
  | "internalNotes"
>;

const fields = [
  ["fullName", "Full name", true],
  ["phone", "Telephone", false],
  ["email", "Email", false],
  ["addressLine1", "Address line 1", false],
  ["addressLine2", "Address line 2", false],
  ["city", "City", false],
  ["postcode", "Postcode", false],
  ["country", "Country", false],
] as const;

export function CustomerForm({
  action,
  customer,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  customer?: CustomerDefaults;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form
      action={formAction}
      className="mt-8 space-y-6 rounded-2xl border bg-white p-6 shadow-panel"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map(([name, label, required]) => (
          <div
            key={name}
            className={name === "fullName" ? "sm:col-span-2" : ""}
          >
            <label
              htmlFor={name}
              className="text-sm font-medium text-slate-700"
            >
              {label}
              {required ? " *" : ""}
            </label>
            <input
              id={name}
              name={name}
              type={name === "email" ? "email" : "text"}
              required={required}
              defaultValue={customer?.[name] ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.[name])}
              className="mt-2 w-full rounded-xl border px-4 py-3 text-sm"
            />
            {state.fieldErrors?.[name]?.map((error) => (
              <p key={error} className="mt-1 text-sm text-red-600">
                {error}
              </p>
            ))}
          </div>
        ))}
      </div>
      <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
        Telephone and email are optional. Adding at least one makes order
        communication much easier.
      </p>
      {["deliveryNotes", "internalNotes"].map((name) => (
        <div key={name}>
          <label htmlFor={name} className="text-sm font-medium text-slate-700">
            {name === "deliveryNotes" ? "Delivery notes" : "Internal notes"}
          </label>
          <textarea
            id={name}
            name={name}
            rows={4}
            defaultValue={
              customer?.[name as "deliveryNotes" | "internalNotes"] ?? ""
            }
            className="mt-2 w-full rounded-xl border px-4 py-3 text-sm"
          />
        </div>
      ))}
      {state.message ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.message}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save customer"}
      </button>
    </form>
  );
}
