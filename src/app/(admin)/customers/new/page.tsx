import { PageHeading } from "@/components/admin/page-heading";
import { CustomerForm } from "@/components/customers/customer-form";
import { createCustomerAction } from "../actions";

export default function NewCustomerPage() {
  return (
    <>
      <PageHeading
        title="New customer"
        description="Create a customer record. A customer number will be assigned automatically."
      />
      <CustomerForm action={createCustomerAction} />
    </>
  );
}
