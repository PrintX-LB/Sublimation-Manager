"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  Search,
  RotateCcw,
  Download,
  Eye,
  ArrowRightLeft,
  Trash2,
  Printer,
  ExternalLink,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { generateManualSheetAction } from "./actions";
import { orderItemReference } from "@/lib/orders/item-reference";

interface ArtworkVersionData {
  id: string;
  version: number;
  editedPath: string;
  printReadyPath: string;
  widthPx: number;
  heightPx: number;
  templateWidthMm: number;
  templateHeightMm: number;
  templateDpi: number;
  createdAt: string;
  printSheetSlots: Array<{ id: string }>;
  project: {
    orderItem: {
      id: string;
      productNameSnapshot: string;
      itemSequence: number;
      productVariant: { name: string } | null;
      orderId: string;
      order: {
        orderNumber: string;
        status: string;
        dueDate: string | null;
        customer: {
          fullName: string;
        };
      };
    };
  };
}

interface SheetBuilderFormProps {
  initialVersions: ArtworkVersionData[];
  createdId?: string;
  createdStoragePath?: string;
}

export function SheetBuilderForm({
  initialVersions,
  createdId,
  createdStoragePath,
}: SheetBuilderFormProps) {
  // Navigation pending state
  const [exportPending, setExportPending] = useState(false);

  // Search & Filters state
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unassigned" | "assigned">(
    "all",
  );

  // Selection state
  const [slot1, setSlot1] = useState<ArtworkVersionData | null>(null);
  const [slot2, setSlot2] = useState<ArtworkVersionData | null>(null);
  const [slot3, setSlot3] = useState<ArtworkVersionData | null>(null);
  const [useSameTwice, setUseSameTwice] = useState(false);

  // Settings state
  const [includeStrips, setIncludeStrips] = useState(true);
  const [cutMarkMode, setCutMarkMode] = useState<"NONE" | "CORNER_MARKS" | "FULL_OUTLINE">("CORNER_MARKS");
  const [cutMarkLengthMm, setCutMarkLengthMm] = useState(8);
  const [cutMarkOffsetMm, setCutMarkOffsetMm] = useState(3);
  const [cutMarkThicknessMm, setCutMarkThicknessMm] = useState(0.3);
  const [filename, setFilename] = useState("A4_print_sheet.pdf");
  const [generationRequestKey, setGenerationRequestKey] = useState(() =>
    crypto.randomUUID(),
  );

  // Drag over states
  const [isDragOverSlot1, setIsDragOverSlot1] = useState(false);
  const [isDragOverSlot2, setIsDragOverSlot2] = useState(false);
  const [isDragOverSlot3, setIsDragOverSlot3] = useState(false);

  const isThreeUp = Boolean(
    (slot1 && slot1.templateWidthMm === 200 && slot1.templateHeightMm === 90) ||
      (!slot1 && initialVersions.some((version) => version.templateWidthMm === 200 && version.templateHeightMm === 90)),
  );

  React.useEffect(() => {
    if (!isThreeUp && slot3) setSlot3(null);
  }, [isThreeUp, slot3]);

  // Auto-generate filename when slots are selected
  React.useEffect(() => {
    if (slot1) {
      const firstNum = orderItemReference(slot1.project.orderItem.order.orderNumber, slot1.project.orderItem.itemSequence);
      const secondNum = useSameTwice
        ? firstNum
        : (slot2 ? orderItemReference(slot2.project.orderItem.order.orderNumber, slot2.project.orderItem.itemSequence) : "empty");
      const thirdNum = slot3
        ? orderItemReference(slot3.project.orderItem.order.orderNumber, slot3.project.orderItem.itemSequence)
        : null;
      setFilename(`A4_${firstNum}_${secondNum}${thirdNum ? `_${thirdNum}` : ""}.pdf`);
    } else {
      setFilename("A4_print_sheet.pdf");
    }
  }, [slot1, slot2, slot3, useSameTwice]);

  // Filter versions based on search query and filter tabs
  const filteredVersions = useMemo(() => {
    return initialVersions.filter((v) => {
      const matchesSearch =
        v.project.orderItem.order.orderNumber
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        v.project.orderItem.order.customer.fullName
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        v.project.orderItem.productNameSnapshot
          .toLowerCase()
          .includes(search.toLowerCase());

      const isUsed = v.printSheetSlots.length > 0;
      const matchesTab =
        filterTab === "all" ||
        (filterTab === "unassigned" && !isUsed) ||
        (filterTab === "assigned" && isUsed);

      return matchesSearch && matchesTab;
    });
  }, [initialVersions, search, filterTab]);

  // Dynamic values
  const effectiveSlot2 = useSameTwice ? slot1 : slot2;
  const effectiveSlot3 = isThreeUp ? slot3 : null;
  const isGenerateDisabled = !slot1 || (!effectiveSlot2 && !useSameTwice);

  // Estimated file size: A4 300DPI PNG has an estimated footprint in RAM or compressed disk space.
  // 2480 * 3508 * 4 channels = ~34.8 MB uncompressed raw. Compressed is usually 1.2MB - 4.5MB.
  const estimatedFileSize = useMemo(() => {
    if (!slot1 && !effectiveSlot2) return "0.0 MB";
    let base = 1.2;
    if (slot1) base += 0.8;
    if (effectiveSlot2) base += 0.8;
    if (effectiveSlot3) base += 0.8;
    return `${base.toFixed(1)} MB`;
  }, [slot1, effectiveSlot2, effectiveSlot3]);

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, version: ArtworkVersionData) => {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ source: "list", versionId: version.id }),
    );
  };

  const handleDragStartFromSlot = (e: React.DragEvent, slotIndex: 1 | 2 | 3) => {
    const version = slotIndex === 1 ? slot1 : slotIndex === 2 ? slot2 : slot3;
    if (version) {
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ source: `slot${slotIndex}`, versionId: version.id }),
      );
    }
  };

  const handleDrop = (e: React.DragEvent, slotIndex: 1 | 2 | 3) => {
    e.preventDefault();
    setIsDragOverSlot1(false);
    setIsDragOverSlot2(false);
    setIsDragOverSlot3(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { source, versionId } = data;

      const targetVersion = initialVersions.find((v) => v.id === versionId);
      if (!targetVersion) return;

      if (source === "list") {
        if (slotIndex === 1) {
          setSlot1(targetVersion);
        } else if (slotIndex === 2) {
          setSlot2(targetVersion);
        } else {
          setSlot3(targetVersion);
        }
      } else if (source === "slot1" && slotIndex === 2) {
        // Dragged from slot 1 to slot 2
        setSlot2(slot1);
        setSlot1(null);
      } else if (source === "slot2" && slotIndex === 1) {
        // Dragged from slot 2 to slot 1
        setSlot1(slot2);
        setSlot2(null);
      } else if (source === "slot3" && slotIndex === 1) {
        setSlot1(slot3);
        setSlot3(null);
      } else if (source === "slot3" && slotIndex === 2) {
        setSlot2(slot3);
        setSlot3(null);
      }
    } catch (err) {
      console.error("Drag and drop failed", err);
    }
  };

  const handleSwap = () => {
    const temp = slot1;
    setSlot1(slot2);
    setSlot2(temp);
  };

  const handleReset = () => {
    setSlot1(null);
    setSlot2(null);
    setSlot3(null);
    setUseSameTwice(false);
    setIncludeStrips(true);
    setCutMarkMode("CORNER_MARKS");
    setCutMarkLengthMm(8);
    setCutMarkOffsetMm(3);
    setCutMarkThicknessMm(0.3);
    setFilename("A4_print_sheet.pdf");
  };

  // Generation outcome state
  const [outcome, setOutcome] = useState<{
    sheetId: string;
    storagePath: string;
    updated: string[];
    alreadyReady: string[];
    skipped: string[];
    warnings: string[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal Preview States
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const viewButtonRef = React.useRef<HTMLButtonElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  // Trigger print logic
  const handlePrint = (filePath: string) => {
    const printWindow = window.open(`/api/local-files?path=${encodeURIComponent(filePath)}`, "_blank");
    if (printWindow) printWindow.focus();
  };

  // Keyboard trap and Escape listeners
  React.useEffect(() => {
    if (!isPreviewOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPreviewOpen(false);
        viewButtonRef.current?.focus();
      }
      if (e.key === "Tab") {
        // Simple focus trap
        if (closeButtonRef.current) {
          e.preventDefault();
          closeButtonRef.current.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewOpen]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerateDisabled) return;

    try {
      setExportPending(true);
      setErrorMsg(null);
      setOutcome(null);

      const form = new FormData();
      form.set("slot1", slot1!.id);
      form.set("slot2", effectiveSlot2!.id);
      if (effectiveSlot3) form.set("slot3", effectiveSlot3.id);
      form.set("includeStrips", includeStrips ? "on" : "off");
      form.set("includeContour", "off");
      form.set("cutMarkMode", cutMarkMode);
      form.set("cutMarkLengthMm", String(cutMarkLengthMm));
      form.set("cutMarkOffsetMm", String(cutMarkOffsetMm));
      form.set("cutMarkThicknessMm", String(cutMarkThicknessMm));
      form.set("filename", filename);
      form.set("generationRequestKey", generationRequestKey);

      // Call server action directly and parse results
      const res = await generateManualSheetAction(form);
      setOutcome(res);
      setGenerationRequestKey(crypto.randomUUID());
    } catch (err) {
      console.error("Failed to generate manual sheet:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to generate manual sheet.",
      );
    } finally {
      setExportPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Real Generation Error alert */}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <p className="font-bold">Generation Failed</p>
          <p className="mt-1 text-xs text-red-400/90">{errorMsg}</p>
        </div>
      )}

      {/* Generated Banner with transition outcomes */}
      {(outcome || (createdId && createdStoragePath)) && (
        <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-emerald-200">
            <div className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs text-emerald-400">
                ✓
              </span>
              <p className="text-sm font-semibold">
                Print Sheet generated successfully!
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                ref={viewButtonRef}
                onClick={() => {
                  setPreviewLoading(true);
                  setPreviewError(false);
                  setIsPreviewOpen(true);
                }}
                className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700"
              >
                <Eye size={13} /> View Sheet
              </button>
              <a
                href={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                download
                className="flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 font-bold text-white hover:bg-brand-700"
              >
                <Download size={13} /> Download
              </a>
            </div>
          </div>

          {/* Outcome metrics */}
          {outcome && (
            <div className="space-y-2 border-t border-emerald-500/20 pt-3 text-xs text-slate-300">
              {outcome.updated.length > 0 && (
                <div>
                  <span className="font-bold text-emerald-400">
                    Orders updated to Ready to Print:{" "}
                  </span>
                  <span className="font-mono text-emerald-300">
                    {outcome.updated.join(", ")}
                  </span>
                </div>
              )}
              {outcome.alreadyReady.length > 0 && (
                <div>
                  <span className="font-semibold text-slate-400">
                    Orders already Ready to Print:{" "}
                  </span>
                  <span className="font-mono text-slate-400">
                    {outcome.alreadyReady.join(", ")}
                  </span>
                </div>
              )}
              {outcome.warnings.map((warn, i) => (
                <div key={i} className="flex items-start gap-1 text-amber-400">
                  <span>⚠</span> <span>{warn}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main 3-Column Workspace */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr_340px]">
        {/* LEFT PANEL: Available Artwork */}
        <section className="flex max-h-[800px] flex-col space-y-4 overflow-hidden rounded-2xl border border-slate-800 bg-[#1e293b]/50 p-4">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">
              Available Artwork
            </h2>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search orders or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-[#0f172a] py-2 pl-9 pr-4 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Filter Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950 p-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`rounded py-1 font-semibold transition ${filterTab === "all" ? "bg-slate-800 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("unassigned")}
                className={`rounded py-1 font-semibold transition ${filterTab === "unassigned" ? "bg-slate-800 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}
              >
                Unused
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("assigned")}
                className={`rounded py-1 font-semibold transition ${filterTab === "assigned" ? "bg-slate-800 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}
              >
                Used
              </button>
            </div>
          </div>

          {/* Draggable Artwork List */}
          <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pr-1">
            {filteredVersions.length ? (
              filteredVersions.map((version) => {
                const item = version.project.orderItem;
                const isAssigned = version.printSheetSlots.length > 0;

                return (
                  <div
                    key={version.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, version)}
                    className="group relative flex cursor-grab flex-col gap-3 rounded-xl border border-slate-800 bg-[#0f172a]/40 p-3 transition hover:border-slate-700 hover:bg-[#0f172a]/60 active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded border border-slate-800 bg-slate-900">
                        <Image
                          src={`/api/local-files?path=${encodeURIComponent(version.printReadyPath || version.editedPath)}`}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-contain p-0.5"
                        />
                      </div>
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="font-semibold text-slate-200">
                          {orderItemReference(item.order.orderNumber, item.itemSequence)}
                        </p>
                        <p className="truncate font-medium text-slate-400">
                          {item.order.customer.fullName}
                        </p>
                        <p className="mt-0.5 truncate text-slate-500">
                          {item.productNameSnapshot}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-slate-600">
                          v{version.version} · Due{" "}
                          {item.order.dueDate
                            ? new Date(item.order.dueDate).toLocaleDateString(
                                "en-GB",
                              )
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    {/* Shortcuts footer */}
                    <div className="flex gap-1.5 border-t border-slate-900/60 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSlot1(version);
                          if (useSameTwice) setSlot2(null);
                        }}
                        className="flex-1 rounded bg-slate-800 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-700"
                      >
                        Slot 1
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSlot2(version);
                          setUseSameTwice(false);
                        }}
                        disabled={useSameTwice}
                        className="flex-1 rounded bg-slate-800 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Slot 2
                      </button>
                      {isThreeUp && (
                        <button
                          type="button"
                          onClick={() => setSlot3(version)}
                          className="flex-1 rounded bg-slate-800 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-700"
                        >
                          Slot 3
                        </button>
                      )}
                      {isAssigned && (
                        <span className="flex items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                          Used
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-xs text-slate-500">
                No compatible artwork found.
              </div>
            )}
          </div>
        </section>

        {/* CENTER PANEL: Large A4 Sheet Preview */}
        <section className="flex flex-col space-y-4 rounded-2xl border border-slate-800 bg-[#1e293b]/50 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Sheet Layout Preview
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSwap}
                disabled={useSameTwice || (!slot1 && !slot2)}
                className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
              >
                <ArrowRightLeft size={13} /> Swap Slots
              </button>
            </div>
          </div>

          {/* Visual A4 Aspect Frame */}
          <div className="flex min-h-[500px] flex-1 items-center justify-center rounded-xl border border-slate-900 bg-slate-950/40 p-4">
            <div className="relative aspect-[210/297] w-full max-w-[380px] rounded-lg border border-slate-700 bg-white p-3 text-slate-900 shadow-2xl transition-all">
              <div className="flex h-full flex-col justify-between space-y-2">
                {/* SLOT 1 CONTAINER */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverSlot1(true);
                  }}
                  onDragLeave={() => setIsDragOverSlot1(false)}
                  onDrop={(e) => handleDrop(e, 1)}
                  draggable={!!slot1}
                  onDragStart={(e) => handleDragStartFromSlot(e, 1)}
                  className={`relative flex h-[31%] cursor-grab items-center justify-center rounded-lg border-2 border-dashed transition active:cursor-grabbing ${
                    isDragOverSlot1
                      ? "border-brand-500 bg-brand-500/10"
                      : slot1
                        ? "border-slate-300 bg-slate-50"
                        : "border-slate-300 bg-slate-50/50 hover:border-slate-400"
                  }`}
                >
                  {slot1 ? (
                    <div className="relative flex h-full w-full items-center justify-center p-2">
                      <div className="relative h-full w-full">
                        <Image
                          src={`/api/local-files?path=${encodeURIComponent(slot1.printReadyPath || slot1.editedPath)}`}
                          alt=""
                          fill
                          className="object-contain"
                          style={{ transform: "scaleX(-1)" }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSlot1(null)}
                        className="absolute right-2 top-2 rounded-lg p-1 text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute bottom-2 left-2 rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[9px] text-white">
                        {orderItemReference(slot1.project.orderItem.order.orderNumber, slot1.project.orderItem.itemSequence)} (Slot 1)
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs font-semibold text-slate-500">
                        Slot 1 ({isThreeUp ? "200 × 90mm" : "210 × 95mm"})
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Drag artwork here
                      </p>
                    </div>
                  )}
                </div>

                {!isThreeUp && <>{/* PRODUCTION STRIP 1 */}
                <div
                  className={`flex h-[15%] flex-col justify-center rounded-lg border border-slate-300 bg-slate-50/80 p-2 font-mono text-[8px] leading-normal text-slate-700 transition ${!includeStrips ? "opacity-30" : ""}`}
                >
                  <p className="mb-0.5 border-b border-slate-200 pb-0.5 font-bold">
                    PRODUCTION STRIP 1
                  </p>
                  {slot1 && includeStrips ? (
                    <>
                      <p>
                        {orderItemReference(slot1.project.orderItem.order.orderNumber, slot1.project.orderItem.itemSequence)} ·{" "}
                        {slot1.project.orderItem.order.customer.fullName}
                      </p>
                      <p className="truncate">
                        {slot1.project.orderItem.productNameSnapshot} (v
                        {slot1.version})
                      </p>
                    </>
                  ) : (
                    <p className="italic text-slate-400">
                      No slot data assigned
                    </p>
                  )}
                </div>
                </>}

                {/* SLOT 2 CONTAINER */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!useSameTwice) setIsDragOverSlot2(true);
                  }}
                  onDragLeave={() => setIsDragOverSlot2(false)}
                  onDrop={(e) => handleDrop(e, 2)}
                  draggable={!!slot2 && !useSameTwice}
                  onDragStart={(e) => handleDragStartFromSlot(e, 2)}
                  className={`relative flex h-[31%] items-center justify-center rounded-lg border-2 border-dashed transition ${
                    useSameTwice
                      ? "cursor-not-allowed border-emerald-500/50 bg-emerald-50/30"
                      : isDragOverSlot2
                        ? "cursor-grab border-brand-500 bg-brand-500/10"
                        : slot2
                          ? "cursor-grab border-slate-300 bg-slate-50"
                          : "cursor-grab border-slate-300 bg-slate-50/50 hover:border-slate-400"
                  }`}
                >
                  {useSameTwice ? (
                    <div className="relative flex h-full w-full items-center justify-center p-2">
                      {slot1 ? (
                        <div className="relative h-full w-full opacity-60">
                          <Image
                            src={`/api/local-files?path=${encodeURIComponent(slot1.printReadyPath || slot1.editedPath)}`}
                            alt=""
                            fill
                            className="object-contain"
                            style={{ transform: "scaleX(-1)" }}
                          />
                        </div>
                      ) : null}
                      <div className="absolute rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                        Copy of Slot 1
                      </div>
                    </div>
                  ) : slot2 ? (
                    <div className="relative flex h-full w-full items-center justify-center p-2">
                      <div className="relative h-full w-full">
                        <Image
                          src={`/api/local-files?path=${encodeURIComponent(slot2.printReadyPath || slot2.editedPath)}`}
                          alt=""
                          fill
                          className="object-contain"
                          style={{ transform: "scaleX(-1)" }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSlot2(null)}
                        className="absolute right-2 top-2 rounded-lg p-1 text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute bottom-2 left-2 rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[9px] text-white">
                        {orderItemReference(slot2.project.orderItem.order.orderNumber, slot2.project.orderItem.itemSequence)} (Slot 2)
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs font-semibold text-slate-500">
                        Slot 2 ({isThreeUp ? "200 × 90mm" : "210 × 95mm"})
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Drag artwork here
                      </p>
                    </div>
                  )}
                </div>

                {!isThreeUp && <>{/* PRODUCTION STRIP 2 */}
                <div
                  className={`flex h-[15%] flex-col justify-center rounded-lg border border-slate-300 bg-slate-50/80 p-2 font-mono text-[8px] leading-normal text-slate-700 transition ${!includeStrips ? "opacity-30" : ""}`}
                >
                  <p className="mb-0.5 border-b border-slate-200 pb-0.5 font-bold">
                    PRODUCTION STRIP 2
                  </p>
                  {effectiveSlot2 && includeStrips ? (
                    <>
                      <p>
                        {orderItemReference(effectiveSlot2.project.orderItem.order.orderNumber, effectiveSlot2.project.orderItem.itemSequence)} ·{" "}
                        {
                          effectiveSlot2.project.orderItem.order.customer
                            .fullName
                        }
                      </p>
                      <p className="truncate">
                        {effectiveSlot2.project.orderItem.productNameSnapshot}{" "}
                        (v{effectiveSlot2.version})
                      </p>
                    </>
                  ) : (
                    <p className="italic text-slate-400">
                      No slot data assigned
                    </p>
                  )}
                </div>
                </>}

                {/* SLOT 3 CONTAINER for 200 × 90 mm mug templates */}
                {isThreeUp && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOverSlot3(true);
                    }}
                    onDragLeave={() => setIsDragOverSlot3(false)}
                    onDrop={(e) => handleDrop(e, 3)}
                    draggable={!!slot3}
                    onDragStart={(e) => handleDragStartFromSlot(e, 3)}
                    className={`relative flex h-[31%] cursor-grab items-center justify-center rounded-lg border-2 border-dashed transition active:cursor-grabbing ${
                      isDragOverSlot3
                        ? "border-brand-500 bg-brand-500/10"
                        : slot3
                          ? "border-slate-300 bg-slate-50"
                          : "border-slate-300 bg-slate-50/50 hover:border-slate-400"
                    }`}
                  >
                    {slot3 ? (
                      <div className="relative flex h-full w-full items-center justify-center p-2">
                        <div className="relative h-full w-full">
                          <Image
                            src={`/api/local-files?path=${encodeURIComponent(slot3.printReadyPath || slot3.editedPath)}`}
                            alt=""
                            fill
                            className="object-contain"
                            style={{ transform: "scaleX(-1)" }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setSlot3(null)}
                          className="absolute right-2 top-2 rounded-lg p-1 text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                        <div className="absolute bottom-2 left-2 rounded bg-slate-900/80 px-1.5 py-0.5 font-mono text-[9px] text-white">
                          {orderItemReference(slot3.project.orderItem.order.orderNumber, slot3.project.orderItem.itemSequence)} (Slot 3)
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-xs font-semibold text-slate-500">Slot 3 (200 × 90mm)</p>
                        <p className="mt-1 text-[10px] text-slate-400">Optional third transfer</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT PANEL: Export & Generate */}
        <section className="flex flex-col space-y-5 rounded-2xl border border-slate-800 bg-[#1e293b]/50 p-5">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-200">
              Sheet Settings
            </h2>
            <p className="text-xs text-slate-400">
              Configure parameters before rendering the final PDF.
            </p>
          </div>

          <form
            onSubmit={handleGenerate}
            className="flex flex-1 flex-col justify-between space-y-6"
          >
            <div className="space-y-4">
              {/* Copy Toggle */}
              <label className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-slate-800 bg-[#0f172a]/30 px-3.5 py-3 transition hover:bg-[#0f172a]/50">
                <input
                  type="checkbox"
                  checked={useSameTwice}
                  onChange={(e) => {
                    setUseSameTwice(e.target.checked);
                    if (e.target.checked) setSlot2(null);
                  }}
                  className="h-4 w-4 rounded border-slate-800 bg-[#0f172a] text-brand-600 focus:ring-brand-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-200">
                    Use same artwork twice
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    Replicate Slot 1 automatically to Slot 2.
                  </p>
                </div>
              </label>

              {/* Toggle controls */}
              <div className="space-y-2.5 text-xs">
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#0f172a]/30 px-3.5 py-2.5 transition hover:bg-[#0f172a]/50">
                  <span className="font-semibold text-slate-300">
                    Production strips
                  </span>
                  <input
                    type="checkbox"
                    checked={includeStrips}
                    onChange={(e) => setIncludeStrips(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-800 bg-[#0f172a] text-brand-600 focus:ring-brand-500"
                  />
                </label>

                <div className="rounded-xl border border-slate-800 bg-[#0f172a]/30 px-3.5 py-2.5">
                  <label className="block font-semibold text-slate-300" htmlFor="cut-mark-mode">Cut marks</label>
                  <select id="cut-mark-mode" value={cutMarkMode} onChange={(event) => setCutMarkMode(event.target.value as typeof cutMarkMode)} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-2 py-2 text-sm text-slate-200">
                    <option value="NONE">None</option>
                    <option value="CORNER_MARKS">Corner marks (recommended)</option>
                    <option value="FULL_OUTLINE">Full outline</option>
                  </select>
                  {cutMarkMode !== "NONE" ? (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                      <label>Length (mm)<input type="number" min="0.1" step="0.1" value={cutMarkLengthMm} onChange={(event) => setCutMarkLengthMm(Number(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-[#0f172a] px-2 py-1 text-slate-200" /></label>
                      <label>Offset (mm)<input type="number" min="0" step="0.1" value={cutMarkOffsetMm} onChange={(event) => setCutMarkOffsetMm(Number(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-[#0f172a] px-2 py-1 text-slate-200" /></label>
                      <label>Line (mm)<input type="number" min="0.1" step="0.1" value={cutMarkThicknessMm} onChange={(event) => setCutMarkThicknessMm(Number(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-[#0f172a] px-2 py-1 text-slate-200" /></label>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Output Name */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Output filename
                </label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="A4_print_sheet.pdf"
                  className="w-full rounded-xl border border-slate-800 bg-[#0f172a] px-3.5 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
                />
              </div>

              {/* Layout properties summary */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-[#0f172a]/40 p-4 text-xs font-medium text-slate-400">
                <p className="flex justify-between">
                  <span>Page Size:</span>
                  <span className="text-slate-200">A4 (210 × 297 mm)</span>
                </p>
                <p className="flex justify-between">
                  <span>Resolution:</span>
                  <span className="text-slate-200">2480 × 3508 px</span>
                </p>
                <p className="flex justify-between">
                  <span>Density:</span>
                  <span className="text-slate-200">300 DPI</span>
                </p>
                <p className="flex justify-between">
                  <span>Est. File Size:</span>
                  <span className="font-mono text-emerald-400">
                    {estimatedFileSize}
                  </span>
                </p>
              </div>
            </div>

            {/* Panel Buttons */}
            <div className="space-y-2">
              <button
                type="submit"
                disabled={isGenerateDisabled || exportPending}
                className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {exportPending ? "Generating..." : "Generate Sheet"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                <RotateCcw className="mr-1.5 inline-block h-3.5 w-3.5" /> Reset
                Sheet
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Preview Sheet Modal Dialog */}
      {isPreviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => {
            setIsPreviewOpen(false);
            viewButtonRef.current?.focus();
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Eye className="text-brand-400 h-4 w-4" /> A4 Sheet Preview
              </h4>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={() => {
                  setIsPreviewOpen(false);
                  viewButtonRef.current?.focus();
                }}
                className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error or Image Frame */}
            <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2 md:min-h-[480px]">
              {previewLoading && !previewError && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                  <span className="text-xs">
                    Loading generated sheet preview...
                  </span>
                </div>
              )}
              {previewError ? (
                <div className="space-y-2 p-8 text-center">
                  <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
                  <p className="text-sm font-bold text-slate-200">
                    Failed to Load Image
                  </p>
                  <p className="text-xs text-slate-500">
                    The generated print sheet file could not be loaded.
                  </p>
                </div>
              ) : (
                <div className="relative aspect-[2480/3508] h-full w-full max-w-[390px]">
                  <iframe
                    src={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                    title="A4 print sheet PDF preview"
                    className="h-full w-full rounded border-0"
                    onLoad={() => setPreviewLoading(false)}
                  />
                </div>
              )}
            </div>

            {/* Metadata Summary Details */}
            <div className="p-4.5 grid shrink-0 grid-cols-1 gap-3 rounded-xl border border-slate-800/80 bg-[#0f172a]/80 text-xs text-slate-400 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p>
                  <span className="font-semibold text-slate-500">
                    Filename:
                  </span>{" "}
                  <span className="break-all font-mono text-slate-200">
                    {filename}
                  </span>
                </p>
                <p>
                  <span className="font-semibold text-slate-500">
                    Resolution:
                  </span>{" "}
                  <span className="text-slate-200">2480 × 3508 px</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-500">Density:</span>{" "}
                  <span className="text-slate-200">300 DPI (A4 portrait)</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <p>
                  <span className="font-semibold text-slate-500">
                    Created Date:
                  </span>{" "}
                  <span className="text-slate-200">
                    {new Date().toLocaleDateString("en-GB")}
                  </span>
                </p>
                <p>
                  <span className="font-semibold text-slate-500">
                    Included Orders:
                  </span>{" "}
                  <span className="font-mono text-emerald-400">
                    {slot1 ? orderItemReference(slot1.project.orderItem.order.orderNumber, slot1.project.orderItem.itemSequence) : ""}
                    {effectiveSlot2 && effectiveSlot2.id !== slot1?.id
                      ? `, ${orderItemReference(effectiveSlot2.project.orderItem.order.orderNumber, effectiveSlot2.project.orderItem.itemSequence)}`
                      : ""}
                  </span>
                </p>
              </div>
            </div>

            {/* Actions Footer Bar */}
            <div className="flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-slate-800 pt-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsPreviewOpen(false);
                  viewButtonRef.current?.focus();
                }}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 font-semibold text-slate-400 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() =>
                  handlePrint(outcome?.storagePath || createdStoragePath || "")
                }
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-700"
              >
                <Printer size={13} /> Print Sheet
              </button>
              <a
                href={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-700"
              >
                <ExternalLink size={13} /> Open in New Tab
              </a>
              <a
                href={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                download
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 font-bold text-white hover:bg-brand-700"
              >
                <Download size={13} /> Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
