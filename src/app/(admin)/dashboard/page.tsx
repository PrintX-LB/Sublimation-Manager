import { Clock3, Palette, PackageCheck, ShoppingBag } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";

const cards = [
  { label: "Open orders", value: "—", icon: ShoppingBag },
  { label: "Awaiting artwork", value: "—", icon: Palette },
  { label: "Ready to print", value: "—", icon: PackageCheck },
  { label: "Due this week", value: "—", icon: Clock3 },
];
export default function DashboardPage() {
  return (
    <>
      <PageHeading
        title="Dashboard"
        description="A clear view of your studio workload will appear here as operational features are added."
      />
      <section
        aria-label="Business summary"
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map(({ label, value, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border bg-white p-5 shadow-panel"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Icon aria-hidden="true" size={20} />
            </span>
            <p className="mt-5 text-3xl font-bold">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </article>
        ))}
      </section>
      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-panel">
        <h2 className="font-semibold">Getting started</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The secure foundation is ready. Customer, product, order, stock and
          artwork workflows are intentionally reserved for later phases.
        </p>
      </section>
    </>
  );
}
