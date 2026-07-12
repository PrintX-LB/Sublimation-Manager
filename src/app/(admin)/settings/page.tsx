import { Settings } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { Placeholder } from "@/components/admin/placeholder";
export default function Page() {
  return (
    <>
      <PageHeading
        title="Settings"
        description="Configure your company workspace and team preferences."
      />
      <Placeholder
        icon={Settings}
        title="Workspace settings"
        description="Company and team configuration will arrive in a later phase."
      />
    </>
  );
}
