"use client";

import type { PrintTemplate } from "@prisma/client";
import { useActionState } from "react";
import type { TemplateFormState } from "@/app/(admin)/print-templates/actions";

export function TemplateForm({
  action,
  template,
}: {
  action: (state: TemplateFormState, data: FormData) => Promise<TemplateFormState>;
  template?: PrintTemplate;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className="mt-8 grid max-w-2xl gap-4 rounded-2xl border bg-white p-6 shadow-panel sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={template?.id ?? ""} />
      {state.message && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2">
          {state.message}
        </p>
      )}
      <label className="sm:col-span-2">
        Name
        <input
          name="name"
          defaultValue={template?.name}
          required
          className="mt-1 w-full rounded-lg border p-2"
        />
      </label>
      <label>
        Width (mm)
        <input
          name="widthMm"
          defaultValue={template?.widthMm.toString()}
          required
          className="mt-1 w-full rounded-lg border p-2"
        />
      </label>
      <label>
        Height (mm)
        <input
          name="heightMm"
          defaultValue={template?.heightMm.toString()}
          required
          className="mt-1 w-full rounded-lg border p-2"
        />
      </label>
      <label>
        DPI
        <input
          name="dpi"
          type="number"
          min="72"
          max="1200"
          defaultValue={template?.dpi ?? 300}
          required
          className="mt-1 w-full rounded-lg border p-2"
        />
      </label>
      <label>
        Bleed (mm)
        <input
          name="bleedMm"
          defaultValue={template?.bleedMm.toString() ?? "0"}
          className="mt-1 w-full rounded-lg border p-2"
        />
      </label>
      <label>
        Safe margin (mm)
        <input
          name="safeAreaMm"
          defaultValue={template?.safeAreaMm.toString() ?? "0"}
          className="mt-1 w-full rounded-lg border p-2"
        />
      </label>
      <label>
        Cut marks
        <select name="cutMarkMode" defaultValue={template?.cutMarkMode ?? "CORNER_MARKS"} className="mt-1 w-full rounded-lg border p-2">
          <option value="NONE">None</option>
          <option value="CORNER_MARKS">Corner marks (recommended)</option>
          <option value="FULL_OUTLINE">Full outline</option>
        </select>
      </label>
      <label>
        Mark length (mm)
        <input name="cutMarkLengthMm" type="number" min="0.1" step="0.1" defaultValue={template?.cutMarkLengthMm?.toString() ?? "8"} className="mt-1 w-full rounded-lg border p-2" />
      </label>
      <label>
        Mark offset (mm)
        <input name="cutMarkOffsetMm" type="number" min="0" step="0.1" defaultValue={template?.cutMarkOffsetMm?.toString() ?? "3"} className="mt-1 w-full rounded-lg border p-2" />
      </label>
      <label>
        Line thickness (mm)
        <input name="cutMarkThicknessMm" type="number" min="0.1" step="0.1" defaultValue={template?.cutMarkThicknessMm?.toString() ?? "0.3"} className="mt-1 w-full rounded-lg border p-2" />
      </label>
      <button disabled={pending} className="rounded bg-brand-600 px-4 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:col-span-2">
        {pending ? "Saving…" : "Save template"}
      </button>
    </form>
  );
}
