"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { ORDER_STATUSES } from "@/lib/orders/status";

export function OrderFilterForm({
  search,
  status,
  payment,
  from,
  to,
}: {
  search: string;
  status: string;
  payment: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of Array.from(formData.entries())) {
      if (value && value !== "all") {
        params.set(key, value.toString());
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleAutoSubmit(e: React.ChangeEvent<HTMLFormElement>) {
    // Only auto-submit for selects and dates, not text inputs (otherwise typing is impossible)
    if (
      e.target instanceof HTMLSelectElement ||
      (e.target instanceof HTMLInputElement && e.target.type === "date")
    ) {
      e.currentTarget.requestSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onChange={handleAutoSubmit}
      className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6 items-end"
    >
      <div className="flex flex-col gap-1 lg:col-span-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Search
        </span>
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={16} />
          <input
            name="q"
            defaultValue={search}
            placeholder="Order number or customer name..."
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 bg-slate-50 focus:bg-white transition"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Status
        </span>
        <select
          name="status"
          defaultValue={status || "all"}
          className="rounded-lg border px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
        >
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Payment
        </span>
        <select
          name="payment"
          defaultValue={payment || "all"}
          className="rounded-lg border px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
        >
          <option value="all">All payment states</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partially paid</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          From
        </span>
        <input
          name="from"
          type="date"
          defaultValue={from}
          className="w-full rounded-lg border px-3 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          To
        </span>
        <input
          name="to"
          type="date"
          defaultValue={to}
          className="w-full rounded-lg border px-3 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
        />
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-6 hidden">
        <Link
          href="/orders"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Reset
        </Link>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Filter
        </button>
      </div>
    </form>
  );
}
