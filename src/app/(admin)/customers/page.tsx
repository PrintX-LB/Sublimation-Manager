import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Users,
  UserPlus,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Pencil,
} from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import {
  listCustomers,
  getCustomerStats,
} from "@/lib/repositories/customers";
import { archiveCustomerAction } from "./actions";
import { ArchiveCustomerButton } from "@/components/customers/archive-customer-button";
import { formatUSD } from "@/lib/money";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ? parts[0].charAt(0) : "";
  const last = parts.length > 1 && parts[parts.length - 1] ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  if (!first) return "";
  if (!last) return parts[0] ? parts[0].substring(0, 2).toUpperCase() : "";
  return (first + last).toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-red-50 text-red-700 border-red-200",
    "bg-orange-50 text-orange-700 border-orange-200",
    "bg-amber-50 text-amber-700 border-amber-200",
    "bg-emerald-50 text-emerald-700 border-emerald-200",
    "bg-teal-50 text-teal-700 border-teal-200",
    "bg-blue-50 text-blue-700 border-blue-200",
    "bg-indigo-50 text-indigo-700 border-indigo-200",
    "bg-violet-50 text-violet-700 border-violet-200",
    "bg-purple-50 text-purple-700 border-purple-200",
    "bg-pink-50 text-pink-700 border-pink-200",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function formatRelativeDate(date: Date | null | undefined) {
  if (!date) return "Never";
  const now = new Date();
  
  const dateCopy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowCopy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = nowCopy.getTime() - dateCopy.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays > 1 && diffDays < 7) {
    return `${diffDays} days ago`;
  }
  
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  
  const requestedStatus = typeof params.status === "string" ? params.status : "active";
  const status = ["active", "archived", "all"].includes(requestedStatus) ? requestedStatus : "active";
  
  const requestedSort = typeof params.sort === "string" ? params.sort : "name";
  const sort = ["name", "totalSpent", "lastOrder", "number", "created", "newest", "oldest"].includes(requestedSort)
    ? requestedSort
    : "name";
    
  const minOrders = typeof params.minOrders === "string" ? Math.max(0, parseInt(params.minOrders) || 0) : 0;
  
  const requestedPage = Number(typeof params.page === "string" ? params.page : "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const result = await listCustomers({ search, sort, status, minOrders, page });
  const stats = await getCustomerStats();

  const pageHref = (nextPage: number) => {
    const queryParams = new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(status !== "active" ? { status } : {}),
      ...(sort !== "name" ? { sort } : {}),
      ...(minOrders > 0 ? { minOrders: String(minOrders) } : {}),
      page: String(nextPage),
    });
    return `/customers?${queryParams.toString()}`;
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title="Customers"
          description="CRM customer management, contact information, total spending and order metrics."
        />
        {stats.totalCustomers > 0 && (
          <Link
            href="/customers/new"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition"
          >
            <Plus size={18} />
            New customer
          </Link>
        )}
      </div>

      {stats.totalCustomers === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-2xl p-12 text-center bg-[#1e293b]/40 mt-8">
          <Users size={36} className="text-slate-600 mb-3" />
          <h4 className="text-sm font-bold text-slate-200">No customers yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">Create your first customer profile to start tracking contact details, orders, invoices, and lifetime spending.</p>
          <Link
            href="/customers/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
          >
            <Plus size={14} />
            Create Customer
          </Link>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Customers</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalCustomers}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Active records</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Users size={20} />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New This Month</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.newCustomersThisMonth}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Joined this month</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                <UserPlus size={20} />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Returning</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.returningCustomers}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">2+ completed orders</p>
              </div>
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                <TrendingUp size={20} />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lifetime Revenue</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatUSD(stats.lifetimeRevenue)}</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Completed orders value</p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                <DollarSign size={20} />
              </div>
            </div>
          </div>

      {/* Search & Filters */}
      <form className="mt-8 grid gap-4 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5 items-end">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Search</span>
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input
              name="q"
              defaultValue={search}
              placeholder="Name, number, phone or email..."
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 bg-slate-50 focus:bg-white transition"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded-lg border px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All Statuses</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sort by</span>
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-lg border px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
          >
            <option value="name">Name A–Z</option>
            <option value="totalSpent">Total spent</option>
            <option value="lastOrder">Last order</option>
            <option value="number">Customer number</option>
            <option value="created">Date created</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Min Orders</span>
          <div className="flex gap-2">
            <input
              name="minOrders"
              type="number"
              min="0"
              defaultValue={minOrders}
              placeholder="e.g. 0"
              className="w-full rounded-lg border px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
            />
            <button className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 shadow-sm">
              Apply
            </button>
          </div>
        </div>
      </form>

      {/* Customer List Container */}
      <section className="mt-5 overflow-hidden rounded-xl border bg-white shadow-sm">
        {/* Desktop & Tablet Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Customer</th>
                <th className="px-5 py-3.5 font-semibold text-center">Orders</th>
                <th className="px-5 py-3.5 font-semibold">Total Spent</th>
                <th className="px-5 py-3.5 font-semibold">Last Order</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.customers.map((customer) => {
                const initials = getInitials(customer.fullName);
                const avatarColor = getAvatarColor(customer.fullName);
                return (
                  <tr key={customer.id} className="hover:bg-slate-50/55 transition-colors duration-150">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold uppercase ${avatarColor}`}>
                          {initials}
                        </div>
                        <div>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="font-bold text-slate-900 hover:text-brand-600 transition"
                          >
                            {customer.fullName}
                          </Link>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mt-0.5">
                            <span className="font-mono text-slate-400 bg-slate-100 rounded px-1 text-[10px]">{customer.customerNumber}</span>
                            {customer.email && <span className="truncate max-w-[150px]">{customer.email}</span>}
                            {customer.phone && <span>· {customer.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Link
                        href={`/orders?q=${encodeURIComponent(customer.fullName)}`}
                        className="inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-lg bg-slate-50 border hover:bg-slate-100 font-semibold text-slate-700 transition"
                        title="View order history"
                      >
                        {customer.completedOrdersCount}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {formatUSD(customer.totalSpent)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 text-sm">
                      {customer.lastOrderDate ? formatRelativeDate(customer.lastOrderDate) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {customer.isArchived ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          Archived
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end items-center gap-1.5">
                        <Link
                          href={`/orders/new?customerId=${customer.id}`}
                          title="Create order"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                        >
                          <ShoppingCart size={16} />
                        </Link>
                        <Link
                          href={`/customers/${customer.id}/edit`}
                          title="Edit details"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                        >
                          <Pencil size={16} />
                        </Link>
                        <ArchiveCustomerButton
                          action={archiveCustomerAction}
                          id={customer.id}
                          name={customer.fullName}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {result.customers.map((customer) => {
            const initials = getInitials(customer.fullName);
            const avatarColor = getAvatarColor(customer.fullName);
            return (
              <div key={customer.id} className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold uppercase ${avatarColor}`}>
                      {initials}
                    </div>
                    <div>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-bold text-slate-900 hover:underline text-base"
                      >
                        {customer.fullName}
                      </Link>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 bg-slate-100 rounded px-1 py-0.25 w-max">
                        {customer.customerNumber}
                      </div>
                    </div>
                  </div>
                  {customer.isArchived ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                      Archived
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 py-2.5 border-t border-b border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block uppercase font-medium tracking-wider">Contact</span>
                    <span className="text-slate-700 block truncate">{customer.phone || customer.email || "No contact info"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-medium tracking-wider">Orders / Spent</span>
                    <span className="text-slate-700 block mt-0.5">
                      <Link href={`/orders?q=${encodeURIComponent(customer.fullName)}`} className="text-brand-600 font-semibold hover:underline">
                        {customer.completedOrdersCount} orders
                      </Link>
                      {" · "}
                      <span className="font-semibold">{formatUSD(customer.totalSpent)}</span>
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block uppercase font-medium tracking-wider">Last Order</span>
                    <span className="text-slate-700 block">
                      {customer.lastOrderDate ? formatRelativeDate(customer.lastOrderDate) : "Never"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Link
                    href={`/orders/new?customerId=${customer.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-brand-50 hover:bg-brand-100 text-brand-700 px-3 py-1.5 rounded-lg transition"
                  >
                    <ShoppingCart size={13} />
                    <span>New Order</span>
                  </Link>
                  <Link
                    href={`/customers/${customer.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border px-3 py-1.5 rounded-lg transition"
                  >
                    <Pencil size={13} />
                    <span>Edit</span>
                  </Link>
                  <div className="scale-90 origin-right">
                    <ArchiveCustomerButton
                      action={archiveCustomerAction}
                      id={customer.id}
                      name={customer.fullName}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {result.customers.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No customers match the current search or filters.
          </p>
        ) : null}
      </section>

      {/* Pagination */}
      <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
        <p>
          {result.total} customer{result.total === 1 ? "" : "s"} found
        </p>
        <div className="flex items-center gap-2">
          <Link
            aria-disabled={page <= 1}
            href={pageHref(Math.max(1, page - 1))}
            className={`rounded-lg border p-2 bg-white hover:bg-slate-50 shadow-sm transition ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            <ChevronLeft size={18} />
            <span className="sr-only">Previous page</span>
          </Link>
          <span className="font-medium text-slate-700">
            Page {Math.min(page, result.pageCount)} of {result.pageCount}
          </span>
          <Link
            aria-disabled={page >= result.pageCount}
            href={pageHref(Math.min(result.pageCount, page + 1))}
            className={`rounded-lg border p-2 bg-white hover:bg-slate-50 shadow-sm transition ${page >= result.pageCount ? "pointer-events-none opacity-40" : ""}`}
          >
            <ChevronRight size={18} />
            <span className="sr-only">Next page</span>
          </Link>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
