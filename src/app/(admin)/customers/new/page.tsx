import { WorkflowHeader } from "@/components/admin/workflow-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { createCustomerAction } from "../actions";

export default function NewCustomerPage() {
  return (
    <>
      <WorkflowHeader
        title="New customer"
        description="Create a customer record. A customer number will be assigned automatically."
        backLabel="Back to Customers"
        fallbackRoute="/customers"
      />
      <CustomerForm action={createCustomerAction} />
    </>
  );
}
