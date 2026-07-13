import { notFound } from "next/navigation";
import { PageHeading } from "@/components/admin/page-heading";
import { TemplateForm } from "@/components/print-templates/template-form";
import { saveTemplateAction } from "../../actions";
import { prisma } from "@/lib/db/prisma";
export default async function EditTemplate({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await prisma.printTemplate.findUnique({ where: { id } });
  if (!template) notFound();
  return (
    <>
      <PageHeading
        title="Edit print template"
        description="Update dimensions used by linked products."
      />
      <TemplateForm action={saveTemplateAction} template={template} />
    </>
  );
}
