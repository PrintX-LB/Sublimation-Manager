import { PageHeading } from "@/components/admin/page-heading";
import { TemplateForm } from "@/components/print-templates/template-form";
import { saveTemplateAction } from "../actions";
export default function NewTemplate() {
  return (
    <>
      <PageHeading
        title="New print template"
        description="Define a reusable printable area."
      />
      <TemplateForm action={saveTemplateAction} />
    </>
  );
}
