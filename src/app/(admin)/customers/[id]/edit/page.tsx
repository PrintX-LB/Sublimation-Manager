import { notFound } from "next/navigation";
import { PageHeading } from "@/components/admin/page-heading";
import { CustomerForm } from "@/components/customers/customer-form";
import { getCustomer } from "@/lib/repositories/customers";
import { customerIdSchema } from "@/lib/validation/customer";
import { updateCustomerAction } from "../../actions";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!customerIdSchema.safeParse(id).success) notFound();
  const customer = await getCustomer(id);
  if (!customer || customer.isArchived) notFound();
  return (
    <>
      <PageHeading
        title="Edit customer"
        description={`${customer.customerNumber} · ${customer.fullName}`}
      />
      <CustomerForm
        customer={customer}
        action={updateCustomerAction.bind(null, id)}
      />
    </>
  );
}
