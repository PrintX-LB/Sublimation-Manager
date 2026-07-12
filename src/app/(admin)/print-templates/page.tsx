import { FileImage } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { Placeholder } from "@/components/admin/placeholder";
export default function Page() {
  return (
    <>
      <PageHeading
        title="Print templates"
        description="Print dimensions and production-ready template files."
      />
      <Placeholder
        icon={FileImage}
        title="Template library"
        description="Artwork editing is intentionally outside Phase 1."
      />
    </>
  );
}
