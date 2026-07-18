import { PageHeading } from "@/components/admin/page-heading";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { DeleteTemplateButton } from "@/components/print-templates/delete-template-button";
import { deleteTemplateAction } from "./actions";

// Templates are stored in the runtime SQLite database. This page must never be
// pre-rendered into the desktop bundle because templates can be created or
// removed after the executable has been built.
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await prisma.printTemplate.findMany({
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeading
        title="Template library"
        description="Reusable print areas for mugs, clothing, mousepads and any printable product."
      />
      <Link
        href="/print-templates/new"
        className="mt-6 inline-block rounded bg-brand-600 px-4 py-2 font-semibold text-white"
      >
        New template
      </Link>
      <section className="mt-8 flex flex-wrap items-start gap-4">
        {templates.map((template) => (
          <article
            key={template.id}
            className="w-fit min-w-[320px] max-w-full rounded-2xl border bg-white p-5 shadow-panel"
          >
            <h2 className="font-semibold break-words">
              <Link href={`/print-templates/${template.id}/edit`}>
                {template.name}
              </Link>
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {template.widthMm.toString()} × {template.heightMm.toString()} mm
              · {template.dpi} DPI
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Safe area {template.safeAreaMm.toString()} mm · Bleed{" "}
              {template.bleedMm.toString()} mm
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Cut marks: {template.cutMarkMode === "CORNER_MARKS" ? "Corner marks" : template.cutMarkMode === "NONE" ? "None" : "Full outline"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
              <Link
                href={`/print-templates/${template.id}/edit`}
                className="rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Edit
              </Link>
              <DeleteTemplateButton templateId={template.id} templateName={template.name} action={deleteTemplateAction} />
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
