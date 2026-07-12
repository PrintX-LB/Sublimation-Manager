import { Package } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { Placeholder } from "@/components/admin/placeholder";
export default function Page() {
  return (
    <>
      <PageHeading
        title="Products"
        description="Products, variants, pricing and print specifications."
      />
      <Placeholder
        icon={Package}
        title="Product catalogue"
        description="Product CRUD is intentionally outside Phase 1."
      />
    </>
  );
}
