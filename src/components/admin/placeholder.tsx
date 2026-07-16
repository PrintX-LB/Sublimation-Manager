import type { LucideIcon } from "lucide-react";

export function Placeholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center shadow-panel">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <Icon aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>
      <span className="mt-5 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        Coming in a later phase
      </span>
    </section>
  );
}
