import { ShoppingCart } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { Placeholder } from "@/components/admin/placeholder";
export default function Page() {
  return (
    <>
      <PageHeading
        title="Orders"
        description="Track customer orders through production and fulfilment."
      />
      <Placeholder
        icon={ShoppingCart}
        title="Order management"
        description="Order creation and processing are intentionally outside Phase 1."
      />
    </>
  );
}
