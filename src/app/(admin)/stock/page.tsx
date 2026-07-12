import { Boxes } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { Placeholder } from "@/components/admin/placeholder";
export default function Page() {
  return (
    <>
      <PageHeading
        title="Stock"
        description="Monitor materials, blanks and stock movement history."
      />
      <Placeholder
        icon={Boxes}
        title="Stock control"
        description="Stock deductions and inventory workflows are intentionally outside Phase 1."
      />
    </>
  );
}
