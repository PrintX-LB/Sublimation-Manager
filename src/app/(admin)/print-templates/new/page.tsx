import { WorkflowHeader } from "@/components/admin/workflow-header";
import { TemplateForm } from "@/components/print-templates/template-form";
import { saveTemplateAction } from "../actions";
export default function NewTemplate() {
  return (
    <>
      <WorkflowHeader
        title="New print template"
        description="Define a reusable printable area."
        backLabel="Back to Print Templates"
        fallbackRoute="/print-templates"
      />
      <TemplateForm action={saveTemplateAction} />
    </>
  );
}
