import { Users } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { Placeholder } from "@/components/admin/placeholder";
export default function Page() {
  return (
    <>
      <PageHeading
        title="Customers"
        description="Customer records and contact information."
      />
      <Placeholder
        icon={Users}
        title="Customer management"
        description="Customer CRUD is intentionally outside Phase 1."
      />
    </>
  );
}
