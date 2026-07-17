import Link from "next/link";
import { FileClock, LayoutGrid, WandSparkles } from "lucide-react";

export type PrintSheetsView = "manual" | "automatic" | "history";

const views = [
  {
    id: "automatic" as const,
    label: "Automatic pairing",
    description: "Review suggested A4 sheets",
    icon: WandSparkles,
  },
  {
    id: "manual" as const,
    label: "Manual creation",
    description: "Choose and arrange artwork",
    icon: LayoutGrid,
  },
  {
    id: "history" as const,
    label: "Generated history",
    description: "Find and manage saved sheets",
    icon: FileClock,
  },
];

export function PrintSheetsWorkspaceNav({ active }: { active: PrintSheetsView }) {
  return (
    <nav
      aria-label="Print Sheets workspace"
      className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-2 md:grid-cols-3"
    >
      {views.map(({ id, label, description, icon: Icon }) => {
        const selected = active === id;
        return (
          <Link
            key={id}
            href={`/production/sheets?view=${id}`}
            aria-current={selected ? "page" : undefined}
            className={`flex min-w-0 items-center gap-3 rounded-lg border px-4 py-3 transition ${
              selected
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
            }`}
          >
            <Icon className="shrink-0" size={18} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block truncate text-xs text-slate-500">
                {description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
