import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/admin/page-heading";
import { prisma } from "@/lib/db/prisma";
import { SHEET_LAYOUT } from "@/lib/production-sheet";
import { createA4PrintSheetAction } from "./actions";

export default async function A4SheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          artworkProject: {
            include: { versions: { orderBy: { version: "desc" } } },
          },
          productVariant: true,
        },
      },
    },
  });
  if (!order) notFound();
  const versions = order.items.flatMap((item) =>
    (item.artworkProject?.versions ?? []).map((version) => ({
      id: version.id,
      label: `${item.productNameSnapshot} · v${version.version}`,
      path: version.printReadyPath || version.editedPath,
    })),
  );
  const firstPreview = versions[0]?.path;
  const secondPreview = versions[1]?.path ?? firstPreview;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeading
        title="Create A4 Print Sheet"
        description={`${order.orderNumber} · two 210 × 95 mm mug designs on portrait A4`}
      />
      {query.created ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Sheet created successfully.{" "}
          <a
            className="underline"
            href={`/api/local-files?path=${encodeURIComponent(query.created)}`}
            download
          >
            Download sheet
          </a>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <section className="flex justify-center rounded-xl border border-slate-700 bg-slate-800/60 p-5">
          <div className="w-full max-w-[390px] bg-white p-2 text-black shadow-xl">
            <div className="aspect-[2480/3508] w-full border border-slate-300 p-1">
              <div className="flex h-full flex-col">
                <div className="relative h-[32%] border-b border-dashed border-slate-500">
                  {firstPreview ? <Image src={`/api/local-files?path=${encodeURIComponent(firstPreview)}`} alt="First mug design preview" fill sizes="390px" className="object-contain" /> : null}
                </div>
                <div className="h-[18%] border-b border-slate-500 p-2 text-[8px]">
                  Production strip 1
                </div>
                <div className="relative h-[32%] border-b border-dashed border-slate-500">
                  {secondPreview ? <Image src={`/api/local-files?path=${encodeURIComponent(secondPreview)}`} alt="Second mug design preview" fill sizes="390px" className="object-contain" /> : null}
                </div>
                <div className="h-[18%] p-2 text-[8px]">Production strip 2</div>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-600">
              Preview · {SHEET_LAYOUT.widthPx} × {SHEET_LAYOUT.heightPx}px · 300
              DPI
            </p>
          </div>
        </section>
        <form
          action={createA4PrintSheetAction}
          className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-5"
        >
          <input type="hidden" name="orderId" value={order.id} />
          <label className="block text-sm">
            First design
            <select
              name="firstVersionId"
              required
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Second design
            <select
              name="secondVersionId"
              required
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="includeStrips" defaultChecked />{" "}
            Include production strips
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="includeContour" /> Include saved cut contours
          </label>
          <label className="block text-sm">
            Sheet filename
            <input
              name="filename"
              defaultValue={`A4_${order.orderNumber}_mugs_1-2.png`}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"
            />
          </label>
          <button className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
            Create A4 Print Sheet
          </button>
          <Link
            href={`/orders/${order.id}`}
            className="block text-center text-sm text-slate-400"
          >
            Back to Order
          </Link>
        </form>
      </div>
    </div>
  );
}
