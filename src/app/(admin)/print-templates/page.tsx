import { PageHeading } from "@/components/admin/page-heading";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
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
      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <article
            key={template.id}
            className="rounded-2xl border bg-white p-5 shadow-panel"
          >
            <h2 className="font-semibold">
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
          </article>
        ))}
      </section>
    </>
  );
}
