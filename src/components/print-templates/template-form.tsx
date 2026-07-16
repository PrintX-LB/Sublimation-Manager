import type { PrintTemplate } from "@prisma/client";
export function TemplateForm({
  action,
  template,
}: {
  action: (data: FormData) => void;
  template?: PrintTemplate;
}) {
  return (
    <form
      action={action}
      className="mt-8 grid max-w-2xl gap-4 rounded-2xl border bg-white p-6 shadow-panel sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={template?.id ?? ""} />
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
      <button className="rounded bg-brand-600 px-4 py-2 font-semibold text-white sm:col-span-2">
        Save template
      </button>
    </form>
  );
}
