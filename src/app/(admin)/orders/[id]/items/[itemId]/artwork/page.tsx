import { notFound } from "next/navigation";
import { PageHeading } from "@/components/admin/page-heading";
import { BackNavigation } from "@/components/admin/back-navigation";
import { ArtworkEditorShell } from "@/components/artwork/artwork-editor-shell";
import { uploadArtworkAction } from "../../../../actions";
import { mmToPixels } from "@/lib/artwork/geometry";
import { prisma } from "@/lib/db/prisma";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * ArtworkPage — Server Component
 *
 * Responsible for:
 *  - Validating the orderItemId and orderId from params
 *  - Loading the OrderItem with its PrintTemplate from the database
 *  - Computing canvas dimensions (px) from the template's mm dimensions
 *  - Loading any previously saved artwork transform state
 *  - Rendering the upload form when no artwork has been uploaded yet
 *  - Rendering ArtworkEditorShell with serializable props only (no functions)
 *
 * onExport and all other callbacks live entirely inside ArtworkEditorShell.
 */
export default async function ArtworkPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;

  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId: id },
    include: {
      order: true,
      productVariant: {
        include: {
          product: {
            include: { printTemplate: true },
          },
        },
      },
      artworkProject: {
        select: {
          positionX: true,
          positionY: true,
          zoom: true,
          rotation: true,
          settingsJson: true,
        },
      },
    },
  });

  if (!item) notFound();

  const template = item.productVariant?.product.printTemplate ?? null;

  // Compute full-resolution canvas dimensions.
  const width = template
    ? mmToPixels(Number(template.widthMm), template.dpi)
    : 1200;
  const height = template
    ? mmToPixels(Number(template.heightMm), template.dpi)
    : 600;

  // Safe-area and bleed in pixels — optional template metadata.
  const safeArea = template?.safeAreaMm
    ? mmToPixels(Number(template.safeAreaMm), template.dpi)
    : 0;
  const bleed = template?.bleedMm
    ? mmToPixels(Number(template.bleedMm), template.dpi)
    : 0;

  const artworkExtension = path.extname(item.customerArtworkPath ?? "").toLowerCase();
  const artworkMime = artworkExtension === ".jpg" || artworkExtension === ".jpeg"
    ? "image/jpeg"
    : artworkExtension === ".webp" ? "image/webp" : "image/png";
  let artworkDataUrl = "";
  if (item.customerArtworkPath) {
    try {
      const storedArtwork = await readFile(path.resolve(process.cwd(), item.customerArtworkPath));
      artworkDataUrl = `data:${artworkMime};base64,${storedArtwork.toString("base64")}`;
    } catch {
      // Keep the editor route usable if a development upload was removed.
      artworkDataUrl = "";
    }
  }

  // Previously saved artwork transform — serialized to plain numbers.
  let storedSettings: Record<string, number> = {};
  let savedDocumentJson: string | undefined;
  if (item.artworkProject?.settingsJson) {
    try {
      const parsed: unknown = JSON.parse(item.artworkProject.settingsJson);
      if (parsed && typeof parsed === "object") {
        storedSettings = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
        if ("document" in parsed) savedDocumentJson = JSON.stringify(parsed.document);
      }
    } catch { storedSettings = {}; }
  }
  const savedState = item.artworkProject
    ? {
        zoom: Number(item.artworkProject.zoom),
        rotation: Number(item.artworkProject.rotation),
        positionX: storedSettings.positionX ?? Number(item.artworkProject.positionX),
        positionY: storedSettings.positionY ?? Number(item.artworkProject.positionY),
        scaleX: storedSettings.scaleX ?? Number(item.artworkProject.zoom),
        scaleY: storedSettings.scaleY ?? Number(item.artworkProject.zoom),
        cropX: storedSettings.cropX ?? 0, cropY: storedSettings.cropY ?? 0,
        cropWidth: storedSettings.cropWidth ?? width, cropHeight: storedSettings.cropHeight ?? height,
        sourceWidth: storedSettings.sourceWidth, sourceHeight: storedSettings.sourceHeight,
        templateWidth: storedSettings.templateWidth ?? width, templateHeight: storedSettings.templateHeight ?? height,
        stateVersion: storedSettings.stateVersion ?? 1,
        documentJson: savedDocumentJson,
      }
    : undefined;

  return (
    <>
      <BackNavigation label="Back to Order" fallbackRoute={`/orders/${item.order.id}`} />
      <PageHeading
        title="Artwork Editor"
        description={`${item.order.orderNumber} · ${item.productNameSnapshot}`}
      />

      <section className="mt-8 rounded-2xl border bg-white p-6 shadow-panel">
        {!item.customerArtworkPath || !artworkDataUrl ? (
          /* ── No artwork uploaded yet ── */
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <h2 className="font-semibold">Upload artwork to begin</h2>
            <p className="mt-2 text-sm text-slate-500">
              Choose a JPG, PNG, or WebP file. The original is kept separately.
            </p>
            <form
              action={uploadArtworkAction}
              encType="multipart/form-data"
              className="mt-5 flex flex-wrap justify-center gap-3"
            >
              <input type="hidden" name="orderItemId" value={item.id} />
              <input
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                className="rounded border px-3 py-2 text-sm"
              />
              <button className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Upload artwork
              </button>
            </form>
          </div>
        ) : (
          /* ── Artwork editor ─────────────────────────────────────────────
             Only serializable props are passed here:
               orderItemId  → string (UUID)
               src          → string (URL path)
               width        → number
               height       → number
               safeArea     → number
               bleed        → number
               savedState   → plain object { zoom, rotation, positionX, positionY }
             NO functions are passed from this Server Component.
             The onExport handler lives inside ArtworkEditorShell.
          ─────────────────────────────────────────────────────────────── */
          <ArtworkEditorShell
            orderItemId={item.id}
            src={artworkDataUrl}
            width={width}
            height={height}
            dpi={template?.dpi ?? 300}
            safeArea={safeArea}
            bleed={bleed}
            savedState={savedState}
          />
        )}
      </section>
    </>
  );
}
