import Link from "next/link";
import { Archive, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/admin/page-heading";
import { BackNavigation } from "@/components/admin/back-navigation";
import { getCustomer } from "@/lib/repositories/customers";
import { customerIdSchema } from "@/lib/validation/customer";
import { archiveCustomerAction } from "../actions";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!customerIdSchema.safeParse(id).success) notFound();
  const customer = await getCustomer(id);
  if (!customer || customer.isArchived) notFound();
  const address = [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.postcode,
    customer.country,
  ].filter(Boolean);
  return (
    <>
      <BackNavigation label="Back to Customers" fallbackRoute="/customers" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={customer.fullName}
          description={customer.customerNumber}
        />
        <div className="flex gap-2">
          <Link
            href={`/customers/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
          >
            <Pencil size={17} />
            Edit
          </Link>
          <form action={archiveCustomerAction}>
            <input type="hidden" name="id" value={id} />
            <button className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700">
              <Archive size={17} />
              Archive
            </button>
          </form>
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border bg-white p-6 shadow-panel lg:col-span-2">
          <h2 className="font-semibold">Contact details</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-400">Telephone</dt>
              <dd className="mt-1 text-sm">
                {customer.phone || "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Email</dt>
              <dd className="mt-1 text-sm">
                {customer.email || "Not provided"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-slate-400">Address</dt>
              <dd className="mt-1 whitespace-pre-line text-sm">
                {address.length ? address.join("\n") : "Not provided"}
              </dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border bg-white p-6 shadow-panel">
          <h2 className="font-semibold">Notes</h2>
          <p className="mt-4 text-sm text-slate-600">
            {customer.deliveryNotes || "No delivery notes."}
          </p>
          <p className="mt-4 border-t pt-4 text-sm text-slate-600">
            {customer.internalNotes || "No internal notes."}
          </p>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-panel">
        <h2 className="font-semibold">Order history</h2>
        {customer.orders.length ? (
          <p className="mt-3 text-sm text-slate-500">
            {customer.orders.length} recent orders
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No orders yet.</p>
        )}
      </section>
    </>
  );
}
