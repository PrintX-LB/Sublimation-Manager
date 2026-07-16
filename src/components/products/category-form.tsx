"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms/state";

export function CategoryForm({
  action,
  category,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  category?: { id: string; name: string; description: string | null };
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form
      action={formAction}
      className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]"
    >
      <input type="hidden" name="id" value={category?.id} />
      <label>
        <span className="sr-only">Category name</span>
        <input
          name="name"
          required
          defaultValue={category?.name}
          placeholder="Category name"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
        />
      </label>
      <label>
        <span className="sr-only">Category description</span>
        <input
          name="description"
          defaultValue={category?.description ?? ""}
          placeholder="Description (optional)"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
        />
      </label>
      <button
        disabled={pending}
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
      >
        {category ? "Update" : "Add category"}
      </button>
      {state.message ? (
        <p role="status" className="text-sm text-slate-600 sm:col-span-3">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
