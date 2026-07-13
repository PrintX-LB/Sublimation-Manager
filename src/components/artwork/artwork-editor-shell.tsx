"use client";

import { useState, useTransition } from "react";
import { ArtworkEditor } from "./artwork-editor";
import { saveArtworkExportAction, saveArtworkStateAction } from "@/app/(admin)/orders/actions";

/** Serializable saved-state that comes from the server. */
export interface ArtworkSavedState {
  zoom: number;
  rotation: number;
  positionX: number;
  positionY: number;
}

interface ArtworkEditorShellProps {
  /** Order-item ID (UUID string) – used when saving the export. */
  orderItemId: string;
  /** Absolute-path or URL of the customer artwork file. */
  src: string;
  /** Canvas width in pixels (computed from the print template on the server). */
  width: number;
  /** Canvas height in pixels (computed from the print template on the server). */
  height: number;
  /** Optional safe-area margin in pixels. */
  safeArea?: number;
  /** Optional bleed margin in pixels. */
  bleed?: number;
  /** Previously saved transform state, if any. */
  savedState?: ArtworkSavedState;
}

export function ArtworkEditorShell({
  orderItemId,
  src,
  width,
  height,
  safeArea,
  bleed,
  savedState,
}: ArtworkEditorShellProps) {
  const [isPending, startTransition] = useTransition();
  const [exportStatus, setExportStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  /**
   * Called by ArtworkEditor when the user clicks "Export print PNG".
   * All server-action calls live here, inside the Client Component.
   */
  const handleExport = (
    dataUrl: string,
    settings: { zoom: number; rotation: number; positionX: number; positionY: number },
  ) => {
    setExportStatus("saving");
    setExportError(null);

    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("orderItemId", orderItemId);
        form.set("dataUrl", dataUrl);
        form.set("widthPx", String(width));
        form.set("heightPx", String(height));
        // Include transform settings so they can be stored server-side if needed.
        form.set("zoom", String(settings.zoom));
        form.set("rotation", String(settings.rotation));
        form.set("positionX", String(settings.positionX));
        form.set("positionY", String(settings.positionY));

        await saveArtworkExportAction(form);
        setExportStatus("saved");
        // Auto-reset the badge after 4 s.
        setTimeout(() => setExportStatus("idle"), 4000);
      } catch (err) {
        console.error("Artwork export failed:", err);
        setExportStatus("error");
        const message = err instanceof Error ? err.message : String(err);
        setExportError(message === "Failed to fetch" ? "The export request was rejected before it reached the server. Restart the development server after the configuration change and try again." : message || "Export failed. Please try again.");
      }
    });
  };

  const handleSave = async (documentJson: string, settings: { zoom: number; rotation: number; positionX: number; positionY: number }) => {
    const form = new FormData();
    form.set("orderItemId", orderItemId);
    form.set("documentJson", documentJson);
    form.set("zoom", String(settings.zoom));
    form.set("rotation", String(settings.rotation));
    form.set("positionX", String(settings.positionX));
    form.set("positionY", String(settings.positionY));
    await saveArtworkStateAction(form);
  };

  return (
    <div className="space-y-4">
      {/* Export status banner */}
      {exportStatus === "saving" && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-sm font-semibold text-amber-400">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          Saving artwork export…
        </div>
      )}
      {exportStatus === "saved" && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-400">
          ✓ Artwork version saved successfully.
        </div>
      )}
      {exportStatus === "error" && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400">
          {exportError ?? "Export failed. Please try again."}
        </div>
      )}

      <ArtworkEditor
        src={src}
        width={width}
        height={height}
        safeArea={safeArea}
        bleed={bleed}
        savedState={savedState}
        onExport={handleExport}
        exportPending={isPending}
        onSave={handleSave}
      />
    </div>
  );
}
