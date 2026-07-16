"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { Search, RotateCcw, Download, Eye, ArrowRightLeft, Trash2, Printer, ExternalLink, X, Loader2, AlertTriangle } from "lucide-react";
import { generateManualSheetAction } from "./actions";

interface ArtworkVersionData {
  id: string;
  version: number;
  editedPath: string;
  printReadyPath: string;
  widthPx: number;
  heightPx: number;
  createdAt: string;
  printSheetSlots: Array<{ id: string }>;
  project: {
    orderItem: {
      id: string;
      productNameSnapshot: string;
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

export function SheetBuilderForm({ initialVersions, createdId, createdStoragePath }: SheetBuilderFormProps) {
  // Navigation pending state
  const [exportPending, setExportPending] = useState(false);

  // Search & Filters state
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unassigned" | "assigned">("all");

  // Selection state
  const [slot1, setSlot1] = useState<ArtworkVersionData | null>(null);
  const [slot2, setSlot2] = useState<ArtworkVersionData | null>(null);
  const [useSameTwice, setUseSameTwice] = useState(false);

  // Settings state
  const [includeStrips, setIncludeStrips] = useState(true);
  const [includeContour, setIncludeContour] = useState(false);
  const [filename, setFilename] = useState("A4_print_sheet.png");

  // Drag over states
  const [isDragOverSlot1, setIsDragOverSlot1] = useState(false);
  const [isDragOverSlot2, setIsDragOverSlot2] = useState(false);

  // Auto-generate filename when slots are selected
  React.useEffect(() => {
    if (slot1) {
      const firstNum = slot1.project.orderItem.order.orderNumber;
      const secondNum = useSameTwice ? firstNum : (slot2?.project.orderItem.order.orderNumber ?? "empty");
      setFilename(`A4_${firstNum}_${secondNum}.png`);
    } else {
      setFilename("A4_print_sheet.png");
    }
  }, [slot1, slot2, useSameTwice]);

  // Filter versions based on search query and filter tabs
  const filteredVersions = useMemo(() => {
    return initialVersions.filter((v) => {
      const matchesSearch =
        v.project.orderItem.order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        v.project.orderItem.order.customer.fullName.toLowerCase().includes(search.toLowerCase()) ||
        v.project.orderItem.productNameSnapshot.toLowerCase().includes(search.toLowerCase());

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
  const isGenerateDisabled = !slot1 || (!effectiveSlot2 && !useSameTwice);

  // Estimated file size: A4 300DPI PNG has an estimated footprint in RAM or compressed disk space.
  // 2480 * 3508 * 4 channels = ~34.8 MB uncompressed raw. Compressed is usually 1.2MB - 4.5MB.
  const estimatedFileSize = useMemo(() => {
    if (!slot1 && !effectiveSlot2) return "0.0 MB";
    let base = 1.2;
    if (slot1) base += 0.8;
    if (effectiveSlot2) base += 0.8;
    return `${base.toFixed(1)} MB`;
  }, [slot1, effectiveSlot2]);

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, version: ArtworkVersionData) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ source: "list", versionId: version.id }));
  };

  const handleDragStartFromSlot = (e: React.DragEvent, slotIndex: 1 | 2) => {
    const version = slotIndex === 1 ? slot1 : slot2;
    if (version) {
      e.dataTransfer.setData("text/plain", JSON.stringify({ source: `slot${slotIndex}`, versionId: version.id }));
    }
  };

  const handleDrop = (e: React.DragEvent, slotIndex: 1 | 2) => {
    e.preventDefault();
    setIsDragOverSlot1(false);
    setIsDragOverSlot2(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { source, versionId } = data;

      const targetVersion = initialVersions.find((v) => v.id === versionId);
      if (!targetVersion) return;

      if (source === "list") {
        if (slotIndex === 1) {
          setSlot1(targetVersion);
        } else {
          setSlot2(targetVersion);
        }
      } else if (source === "slot1" && slotIndex === 2) {
        // Dragged from slot 1 to slot 2
        setSlot2(slot1);
        setSlot1(null);
      } else if (source === "slot2" && slotIndex === 1) {
        // Dragged from slot 2 to slot 1
        setSlot1(slot2);
        setSlot2(null);
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
    setUseSameTwice(false);
    setIncludeStrips(true);
    setIncludeContour(false);
    setFilename("A4_print_sheet.png");
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
  const handlePrint = (imagePath: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Sheet</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; display: flex; align-items: center; justify-content: center; }
            img { width: 100vw; height: 100vh; object-fit: contain; }
          </style>
        </head>
        <body onload="window.print();window.close();">
          <img src="/api/local-files?path=${encodeURIComponent(imagePath)}" />
        </body>
      </html>
    `);
    printWindow.document.close();
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
      form.set("includeStrips", includeStrips ? "on" : "off");
      form.set("includeContour", includeContour ? "on" : "off");
      form.set("filename", filename);

      // Call server action directly and parse results
      const res = await generateManualSheetAction(form);
      setOutcome(res);
    } catch (err) {
      console.error("Failed to generate manual sheet:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate manual sheet.");
    } finally {
      setExportPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Real Generation Error alert */}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
          <p className="font-bold">Generation Failed</p>
          <p className="mt-1 text-xs text-red-400/90">{errorMsg}</p>
        </div>
      )}

      {/* Generated Banner with transition outcomes */}
      {(outcome || (createdId && createdStoragePath)) && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4 text-emerald-200">
            <div className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs text-emerald-400">✓</span>
              <p className="text-sm font-semibold">Print Sheet generated successfully!</p>
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
                className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 border border-slate-700 font-semibold hover:bg-slate-700 text-slate-200"
              >
                <Eye size={13} /> View Sheet
              </button>
              <a
                href={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                download
                className="flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 font-bold hover:bg-brand-700 text-white"
              >
                <Download size={13} /> Download
              </a>
            </div>
          </div>

          {/* Outcome metrics */}
          {outcome && (
            <div className="border-t border-emerald-500/20 pt-3 text-xs space-y-2 text-slate-300">
              {outcome.updated.length > 0 && (
                <div>
                  <span className="font-bold text-emerald-400">Orders updated to Ready to Print: </span>
                  <span className="font-mono text-emerald-300">{outcome.updated.join(", ")}</span>
                </div>
              )}
              {outcome.alreadyReady.length > 0 && (
                <div>
                  <span className="font-semibold text-slate-400">Orders already Ready to Print: </span>
                  <span className="font-mono text-slate-400">{outcome.alreadyReady.join(", ")}</span>
                </div>
              )}
              {outcome.warnings.map((warn, i) => (
                <div key={i} className="text-amber-400 flex items-start gap-1">
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
        <section className="flex flex-col rounded-2xl border border-slate-800 bg-[#1e293b]/50 p-4 space-y-4 max-h-[800px] overflow-hidden">
          <div className="space-y-3">
            <h2 className="font-semibold text-slate-200 text-sm">Available Artwork</h2>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search orders or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-[#0f172a] pl-9 pr-4 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
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
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
            {filteredVersions.length ? (
              filteredVersions.map((version) => {
                const item = version.project.orderItem;
                const isAssigned = version.printSheetSlots.length > 0;
                
                return (
                  <div
                    key={version.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, version)}
                    className="group relative flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0f172a]/40 p-3 hover:border-slate-700 hover:bg-[#0f172a]/60 cursor-grab active:cursor-grabbing transition"
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
                        <p className="font-semibold text-slate-200">{item.order.orderNumber}</p>
                        <p className="truncate font-medium text-slate-400">{item.order.customer.fullName}</p>
                        <p className="truncate text-slate-500 mt-0.5">{item.productNameSnapshot}</p>
                        <p className="text-[10px] text-slate-600 font-mono mt-1">v{version.version} · Due {item.order.dueDate ? new Date(item.order.dueDate).toLocaleDateString("en-GB") : "N/A"}</p>
                      </div>
                    </div>

                    {/* Shortcuts footer */}
                    <div className="flex gap-1.5 pt-2 border-t border-slate-900/60">
                      <button
                        type="button"
                        onClick={() => {
                          setSlot1(version);
                          if (useSameTwice) setSlot2(null);
                        }}
                        className="flex-1 rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-semibold text-slate-300 transition"
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
                        className="flex-1 rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-semibold text-slate-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Slot 2
                      </button>
                      {isAssigned && (
                        <span className="flex items-center justify-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
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
        <section className="flex flex-col rounded-2xl border border-slate-800 bg-[#1e293b]/50 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-200 text-sm">Sheet Layout Preview</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSwap}
                disabled={useSameTwice || (!slot1 && !slot2)}
                className="flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 border border-slate-700 transition disabled:opacity-40"
              >
                <ArrowRightLeft size={13} /> Swap Slots
              </button>
            </div>
          </div>

          {/* Visual A4 Aspect Frame */}
          <div className="flex-1 flex items-center justify-center p-4 bg-slate-950/40 rounded-xl border border-slate-900 min-h-[500px]">
            <div className="relative aspect-[210/297] w-full max-w-[380px] rounded-lg border border-slate-700 bg-white p-3 shadow-2xl text-slate-900 transition-all">
              <div className="flex h-full flex-col space-y-2 justify-between">
                
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
                  className={`relative flex h-[31%] items-center justify-center rounded-lg border-2 border-dashed transition cursor-grab active:cursor-grabbing ${
                    isDragOverSlot1 ? "border-brand-500 bg-brand-500/10" : slot1 ? "border-slate-300 bg-slate-50" : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                  }`}
                >
                  {slot1 ? (
                    <div className="relative h-full w-full flex items-center justify-center p-2">
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
                        className="absolute right-2 top-2 p-1 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute left-2 bottom-2 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                        {slot1.project.orderItem.order.orderNumber} (Slot 1)
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <p className="text-xs font-semibold text-slate-500">Slot 1 (210 × 95mm)</p>
                      <p className="text-[10px] text-slate-400 mt-1">Drag artwork here</p>
                    </div>
                  )}
                </div>

                {/* PRODUCTION STRIP 1 */}
                <div className={`h-[15%] rounded-lg border border-slate-300 bg-slate-50/80 p-2 flex flex-col justify-center text-[8px] font-mono leading-normal text-slate-700 transition ${!includeStrips ? "opacity-30" : ""}`}>
                  <p className="font-bold border-b border-slate-200 pb-0.5 mb-0.5">PRODUCTION STRIP 1</p>
                  {slot1 && includeStrips ? (
                    <>
                      <p>{slot1.project.orderItem.order.orderNumber} · {slot1.project.orderItem.order.customer.fullName}</p>
                      <p className="truncate">{slot1.project.orderItem.productNameSnapshot} (v{slot1.version})</p>
                    </>
                  ) : (
                    <p className="text-slate-400 italic">No slot data assigned</p>
                  )}
                </div>

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
                      ? "border-emerald-500/50 bg-emerald-50/30 cursor-not-allowed"
                      : isDragOverSlot2
                      ? "border-brand-500 bg-brand-500/10 cursor-grab"
                      : slot2
                      ? "border-slate-300 bg-slate-50 cursor-grab"
                      : "border-slate-300 hover:border-slate-400 bg-slate-50/50 cursor-grab"
                  }`}
                >
                  {useSameTwice ? (
                    <div className="relative h-full w-full flex items-center justify-center p-2">
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
                      <div className="absolute bg-emerald-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Copy of Slot 1
                      </div>
                    </div>
                  ) : slot2 ? (
                    <div className="relative h-full w-full flex items-center justify-center p-2">
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
                        className="absolute right-2 top-2 p-1 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute left-2 bottom-2 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                        {slot2.project.orderItem.order.orderNumber} (Slot 2)
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <p className="text-xs font-semibold text-slate-500">Slot 2 (210 × 95mm)</p>
                      <p className="text-[10px] text-slate-400 mt-1">Drag artwork here</p>
                    </div>
                  )}
                </div>

                {/* PRODUCTION STRIP 2 */}
                <div className={`h-[15%] rounded-lg border border-slate-300 bg-slate-50/80 p-2 flex flex-col justify-center text-[8px] font-mono leading-normal text-slate-700 transition ${!includeStrips ? "opacity-30" : ""}`}>
                  <p className="font-bold border-b border-slate-200 pb-0.5 mb-0.5">PRODUCTION STRIP 2</p>
                  {effectiveSlot2 && includeStrips ? (
                    <>
                      <p>{effectiveSlot2.project.orderItem.order.orderNumber} · {effectiveSlot2.project.orderItem.order.customer.fullName}</p>
                      <p className="truncate">{effectiveSlot2.project.orderItem.productNameSnapshot} (v{effectiveSlot2.version})</p>
                    </>
                  ) : (
                    <p className="text-slate-400 italic">No slot data assigned</p>
                  )}
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* RIGHT PANEL: Export & Generate */}
        <section className="flex flex-col rounded-2xl border border-slate-800 bg-[#1e293b]/50 p-5 space-y-5">
          <div className="space-y-1">
            <h2 className="font-semibold text-slate-200 text-sm">Sheet Settings</h2>
            <p className="text-xs text-slate-400">Configure parameters before rendering the final PNG.</p>
          </div>

          <form onSubmit={handleGenerate} className="flex-1 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              {/* Copy Toggle */}
              <label className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-[#0f172a]/30 px-3.5 py-3 hover:bg-[#0f172a]/50 transition cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useSameTwice}
                  onChange={(e) => {
                    setUseSameTwice(e.target.checked);
                    if (e.target.checked) setSlot2(null);
                  }}
                  className="rounded border-slate-800 bg-[#0f172a] text-brand-600 focus:ring-brand-500 h-4 w-4"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-200">Use same artwork twice</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Replicate Slot 1 automatically to Slot 2.</p>
                </div>
              </label>

              {/* Toggle controls */}
              <div className="space-y-2.5 text-xs">
                <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0f172a]/30 px-3.5 py-2.5 hover:bg-[#0f172a]/50 transition cursor-pointer">
                  <span className="font-semibold text-slate-300">Production strips</span>
                  <input
                    type="checkbox"
                    checked={includeStrips}
                    onChange={(e) => setIncludeStrips(e.target.checked)}
                    className="rounded border-slate-800 bg-[#0f172a] text-brand-600 focus:ring-brand-500 h-4 w-4"
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0f172a]/30 px-3.5 py-2.5 hover:bg-[#0f172a]/50 transition cursor-pointer">
                  <span className="font-semibold text-slate-300">Include cut contours</span>
                  <input
                    type="checkbox"
                    checked={includeContour}
                    onChange={(e) => setIncludeContour(e.target.checked)}
                    className="rounded border-slate-800 bg-[#0f172a] text-brand-600 focus:ring-brand-500 h-4 w-4"
                  />
                </label>
              </div>

              {/* Output Name */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Output filename</label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="A4_print_sheet.png"
                  className="w-full rounded-xl border border-slate-800 bg-[#0f172a] px-3.5 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
                />
              </div>

              {/* Layout properties summary */}
              <div className="rounded-xl border border-slate-800 bg-[#0f172a]/40 p-4 space-y-2 text-xs font-medium text-slate-400">
                <p className="flex justify-between"><span>Page Size:</span><span className="text-slate-200">A4 (210 × 297 mm)</span></p>
                <p className="flex justify-between"><span>Resolution:</span><span className="text-slate-200">2480 × 3508 px</span></p>
                <p className="flex justify-between"><span>Density:</span><span className="text-slate-200">300 DPI</span></p>
                <p className="flex justify-between"><span>Est. File Size:</span><span className="text-emerald-400 font-mono">{estimatedFileSize}</span></p>
              </div>
            </div>

            {/* Panel Buttons */}
            <div className="space-y-2">
              <button
                type="submit"
                disabled={isGenerateDisabled || exportPending}
                className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {exportPending ? "Generating..." : "Generate Sheet"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 py-2.5 text-sm font-semibold text-slate-300 transition"
              >
                <RotateCcw className="inline-block h-3.5 w-3.5 mr-1.5" /> Reset Sheet
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
            className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-2 border-b border-slate-800 shrink-0">
              <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-brand-400" /> A4 Sheet Preview
              </h4>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={() => {
                  setIsPreviewOpen(false);
                  viewButtonRef.current?.focus();
                }}
                className="text-slate-500 hover:text-slate-300 rounded p-1 hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error or Image Frame */}
            <div className="relative flex-1 min-h-[300px] md:min-h-[480px] bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden p-2">
              {previewLoading && !previewError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-400 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                  <span className="text-xs">Loading generated sheet preview...</span>
                </div>
              )}
              {previewError ? (
                <div className="text-center p-8 space-y-2">
                  <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
                  <p className="font-bold text-slate-200 text-sm">Failed to Load Image</p>
                  <p className="text-xs text-slate-500">The generated print sheet file could not be loaded.</p>
                </div>
              ) : (
                <div className="w-full h-full max-w-[390px] aspect-[2480/3508] relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                    alt="A4 print sheet preview"
                    className="w-full h-full object-contain"
                    onLoad={() => setPreviewLoading(false)}
                    onError={() => {
                      setPreviewLoading(false);
                      setPreviewError(true);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Metadata Summary Details */}
            <div className="bg-[#0f172a]/80 rounded-xl border border-slate-800/80 p-4.5 text-xs text-slate-400 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
              <div className="space-y-1.5">
                <p><span className="font-semibold text-slate-500">Filename:</span> <span className="font-mono text-slate-200 break-all">{filename}</span></p>
                <p><span className="font-semibold text-slate-500">Resolution:</span> <span className="text-slate-200">2480 × 3508 px</span></p>
                <p><span className="font-semibold text-slate-500">Density:</span> <span className="text-slate-200">300 DPI (A4 portrait)</span></p>
              </div>
              <div className="space-y-1.5">
                <p><span className="font-semibold text-slate-500">Created Date:</span> <span className="text-slate-200">{new Date().toLocaleDateString("en-GB")}</span></p>
                <p>
                  <span className="font-semibold text-slate-500">Included Orders:</span>{" "}
                  <span className="font-mono text-emerald-400">
                    {slot1 ? slot1.project.orderItem.order.orderNumber : ""}
                    {effectiveSlot2 && effectiveSlot2.id !== slot1?.id ? `, ${effectiveSlot2.project.orderItem.order.orderNumber}` : ""}
                  </span>
                </p>
              </div>
            </div>

            {/* Actions Footer Bar */}
            <div className="flex flex-wrap justify-end gap-2.5 pt-2 border-t border-slate-800 shrink-0 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsPreviewOpen(false);
                  viewButtonRef.current?.focus();
                }}
                className="rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 px-4 py-2 font-semibold text-slate-400"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handlePrint(outcome?.storagePath || createdStoragePath || "")}
                className="rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-200 flex items-center gap-1.5"
              >
                <Printer size={13} /> Print Sheet
              </button>
              <a
                href={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-200 flex items-center gap-1.5"
              >
                <ExternalLink size={13} /> Open in New Tab
              </a>
              <a
                href={`/api/local-files?path=${encodeURIComponent(outcome?.storagePath || createdStoragePath || "")}`}
                download
                className="rounded-lg bg-brand-600 hover:bg-brand-700 px-4 py-2 font-bold text-white flex items-center gap-1.5"
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
