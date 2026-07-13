"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, FabricImage } from "fabric";

export interface ArtworkSavedState {
  zoom: number;
  rotation: number;
  positionX: number;
  positionY: number;
  documentJson?: string;
}

interface ArtworkEditorProps {
  src: string;
  width: number;
  height: number;
  safeArea?: number;
  bleed?: number;
  savedState?: ArtworkSavedState;
  onExport?: (dataUrl: string, settings: { zoom: number; rotation: number; positionX: number; positionY: number }) => void;
  onSave?: (documentJson: string, settings: { zoom: number; rotation: number; positionX: number; positionY: number }) => Promise<void>;
  exportPending?: boolean;
}

type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";
type Guides = { vertical?: number; horizontal?: number };

export function ArtworkEditor({ src, width, height, safeArea = 0, bleed = 0, savedState, onExport, onSave, exportPending = false }: ArtworkEditorProps) {
  const canvasElement = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const savedJson = useRef<string | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const restoring = useRef(true);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(savedState?.zoom ?? 1);
  const [rotation, setRotation] = useState(savedState?.rotation ?? 0);
  const [status, setStatus] = useState<SaveStatus>("clean");
  const [editorFocused, setEditorFocused] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [guides, setGuides] = useState<Guides>({});
  const snappingRef = useRef(true);
  const keyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 1000, height: 620 });
  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setWorkspaceSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const displayScale = Math.min(Math.max((workspaceSize.width - 48) / width, 0.05), Math.max((workspaceSize.height - 48) / height, 0.05), 1);
  const displayScaleRef = useRef(displayScale);
  displayScaleRef.current = displayScale;
  const displayWidth = Math.round(width * displayScale);
  const displayHeight = Math.round(height * displayScale);

  useEffect(() => {
    const stored = window.localStorage.getItem("printx-artwork-snapping");
    if (stored === "false") setSnapping(false);
  }, []);
  useEffect(() => { snappingRef.current = snapping; }, [snapping]);

  const serialise = () => JSON.stringify(fabricCanvas.current?.toJSON() ?? { version: "7", objects: [] });
  const transform = () => {
    const object = fabricCanvas.current?.getObjects()[0];
    return { zoom: object?.scaleX ?? zoom, rotation: object?.angle ?? rotation, positionX: object?.left ?? width / 2, positionY: object?.top ?? height / 2 };
  };
  const markDirty = () => {
    if (restoring.current) return;
    const json = serialise();
    if (history.current[historyIndex.current] !== json) {
      history.current = history.current.slice(0, historyIndex.current + 1).concat(json).slice(-30);
      historyIndex.current = history.current.length - 1;
      setStatus("dirty");
    }
  };

  useEffect(() => {
    if (!canvasElement.current) return;
    const canvas = new Canvas(canvasElement.current, { width, height, preserveObjectStacking: true, selection: true });
    fabricCanvas.current = canvas;
    let cancelled = false;
    const initialise = async () => {
      const image = await FabricImage.fromURL(src, { crossOrigin: "anonymous" });
      if (cancelled) return;
      restoring.current = true;
      if (savedState?.documentJson) {
        await canvas.loadFromJSON(JSON.parse(savedState.documentJson));
      } else {
        image.set({ originX: "center", originY: "center", left: width / 2, top: height / 2 });
        image.scaleToWidth(width);
        canvas.add(image);
      }
      canvas.getObjects().forEach((object) => object.set({ selectable: true, evented: true }));
      savedJson.current = serialise();
      history.current = [savedJson.current];
      historyIndex.current = 0;
      restoring.current = false;
      setReady(true);
      setStatus("clean");
      if (process.env.NODE_ENV === "development") console.debug("Artwork editor loaded", { template: [width, height], preview: [displayWidth, displayHeight], restored: Boolean(savedState?.documentJson) });
    };
    const snapObject = (object: import("fabric").FabricObject, event: Event | undefined) => {
      if (!snappingRef.current || (event as MouseEvent | undefined)?.altKey) { setGuides({}); return; }
      const bounds = object.getBoundingRect();
      const tolerance = 8 / displayScaleRef.current;
      const xPoints = [0, width / 2, width];
      const yPoints = [0, height / 2, height];
      if (safeArea > 0) { xPoints.push(safeArea, width - safeArea); yPoints.push(safeArea, height - safeArea); }
      if (bleed > 0) { xPoints.push(bleed, width - bleed); yPoints.push(bleed, height - bleed); }
      const xValues = [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width];
      const yValues = [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height];
      const nearest = (values: number[], points: number[]): { delta: number; point: number } | null => {
        const candidates = values.flatMap((value) => points.map((point) => ({ delta: point - value, point })));
        const candidate = candidates.filter((item) => Math.abs(item.delta) <= tolerance).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
        return candidate ?? null;
      };
      const xSnap = nearest(xValues, xPoints);
      const ySnap = nearest(yValues, yPoints);
      if (xSnap) object.left = (object.left ?? 0) + xSnap.delta;
      if (ySnap) object.top = (object.top ?? 0) + ySnap.delta;
      object.setCoords();
      setGuides({ vertical: xSnap?.point, horizontal: ySnap?.point });
    };
    const moving = (event: { target?: import("fabric").FabricObject; e?: Event }) => { if (event.target) snapObject(event.target, event.e); };
    const rotating = (event: { target?: import("fabric").FabricObject; e?: Event }) => {
      const object = event.target;
      if (!object || !snappingRef.current || (event.e as MouseEvent | undefined)?.altKey) { setGuides({}); return; }
      const angle = ((object.angle ?? 0) % 360 + 360) % 360;
      const snapAngle = Math.round(angle / 45) * 45;
      if (Math.abs(snapAngle - angle) <= 7) object.angle = snapAngle % 360;
    };
    const changed = () => { setGuides({}); markDirty(); };
    canvas.on("object:moving", moving);
    canvas.on("object:rotating", rotating);
    canvas.on("object:modified", changed);
    void initialise();
    return () => { cancelled = true; canvas.off("object:moving", moving); canvas.off("object:rotating", rotating); canvas.off("object:modified", changed); canvas.dispose(); fabricCanvas.current = null; };
  // The Fabric canvas must only be recreated when the source/template changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, width, height, safeArea, bleed]);

  const applyScale = (value: number) => {
    const object = fabricCanvas.current?.getObjects()[0];
    if (!object) return;
    object.set({ scaleX: value, scaleY: value }); object.setCoords();
    setZoom(value);
    fabricCanvas.current?.requestRenderAll();
    markDirty();
  };
  const applyRotation = (value: number) => {
    const object = fabricCanvas.current?.getObjects()[0];
    if (!object) return;
    object.rotate(value); object.setCoords();
    setRotation(value);
    fabricCanvas.current?.requestRenderAll();
    markDirty();
  };
  const center = (record = true) => { const object = fabricCanvas.current?.getObjects()[0]; if (!object) return; const bounds = object.getBoundingRect(); object.set({ left: (object.left ?? 0) + width / 2 - (bounds.left + bounds.width / 2), top: (object.top ?? 0) + height / 2 - (bounds.top + bounds.height / 2) }); object.setCoords(); fabricCanvas.current?.requestRenderAll(); if (record) markDirty(); };
  const fitOrFill = (fillTemplate: boolean) => { const object = fabricCanvas.current?.getObjects()[0]; if (!object) return; const bounds = object.getBoundingRect(); const factor = fillTemplate ? Math.max(width / bounds.width, height / bounds.height) : Math.min(width / bounds.width, height / bounds.height); object.set({ scaleX: (object.scaleX ?? 1) * factor, scaleY: (object.scaleY ?? 1) * factor }); object.setCoords(); center(false); setZoom(object.scaleX ?? 1); markDirty(); };
  const fit = () => fitOrFill(false);
  const fill = () => fitOrFill(true);
  const reset = () => { fit(); applyRotation(0); };
  const save = async () => { if (!onSave || status === "saving") return; setStatus("saving"); try { const json = serialise(); await onSave(json, transform()); savedJson.current = json; setStatus("saved"); } catch { setStatus("error"); } };
  const exportArtwork = () => { const canvas = fabricCanvas.current; if (!canvas || exportPending) return; onExport?.(canvas.toDataURL({ format: "png", multiplier: 1 }), transform()); };
  const groupKeyboardChange = () => { if (keyboardTimer.current) clearTimeout(keyboardTimer.current); keyboardTimer.current = setTimeout(() => { setGuides({}); markDirty(); }, 180); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches("input, textarea, select, [contenteditable='true'], button")) return;
    const object = fabricCanvas.current?.getActiveObject();
    if (!fabricCanvas.current || !object) return;
    if (["+", "=", "-", "_"].includes(event.key) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); applyScale(Math.min(4, Math.max(0.1, (object.scaleX ?? 1) + (event.key === "+" || event.key === "=" ? 0.1 : -0.1)))); return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); const amount = event.ctrlKey ? 0.25 : event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
      const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
      object.set({ left: (object.left ?? 0) + dx, top: (object.top ?? 0) + dy }); object.setCoords();
      fabricCanvas.current.requestRenderAll(); setStatus("dirty"); groupKeyboardChange(); return;
    }
    if (event.key.toLowerCase() === "r") { event.preventDefault(); const next = (((object.angle ?? 0) + (event.shiftKey ? -90 : 90)) % 360 + 360) % 360; object.rotate(next); object.setCoords(); fabricCanvas.current.requestRenderAll(); setRotation(next); setStatus("dirty"); groupKeyboardChange(); }
  };

  return <div className={`flex min-h-0 flex-col gap-3 ${editorFocused ? "outline outline-1 outline-emerald-500/50" : ""}`} onMouseDown={() => workspaceRef.current?.focus()}>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm">
      <button type="button" onClick={() => void save()} disabled={!ready || status === "saving"} className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white">{status === "saving" ? "Saving…" : "Save"}</button>
      <button type="button" onClick={() => applyScale(Math.max(0.1, zoom - 0.01))} className="rounded border border-slate-700 px-3 py-1">Zoom −</button>
      <label className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1 text-xs">Zoom {Math.round(zoom * 100)}%<input aria-label="Zoom" type="range" min="10" max="400" step="1" value={Math.round(zoom * 100)} onChange={(e) => applyScale(Number(e.target.value) / 100)} /></label>
      <label className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1 text-xs">Rotate {Math.round(rotation)}°<input aria-label="Rotation" type="range" min="-180" max="180" step="1" value={Math.round(rotation)} onChange={(e) => applyRotation(Number(e.target.value))} /></label>
      <button type="button" onClick={() => { const next = !snapping; setSnapping(next); snappingRef.current = next; window.localStorage.setItem("printx-artwork-snapping", String(next)); }} className="rounded border border-slate-700 px-3 py-1 text-xs">Snapping: {snapping ? "On" : "Off"}</button><span className="text-xs text-slate-400">Hold Alt to disable snapping.</span>
      <button type="button" onClick={() => applyScale(Math.min(4, zoom + 0.01))} className="rounded border border-slate-700 px-3 py-1">Zoom +</button>
      <button type="button" onClick={fit} className="rounded border border-slate-700 px-3 py-1">Fit</button><button type="button" onClick={fill} className="rounded border border-slate-700 px-3 py-1">Fill</button><button type="button" onClick={() => center()} className="rounded border border-slate-700 px-3 py-1">Centre</button><button type="button" onClick={() => applyRotation(rotation + 45)} className="rounded border border-slate-700 px-3 py-1">Rotate</button><button type="button" onClick={reset} className="rounded border border-slate-700 px-3 py-1">Reset</button><button type="button" onClick={exportArtwork} disabled={!ready || exportPending} className="ml-auto rounded bg-brand-600 px-3 py-1 font-semibold text-white">Export</button>
      <button type="button" onClick={() => setShowShortcuts((value) => !value)} className="rounded border border-slate-700 px-2 py-1 text-xs">Keyboard ?</button><span className="text-xs text-slate-400">{status === "dirty" ? "Unsaved changes" : status === "saved" ? "Saved" : status === "error" ? "Save failed" : ""}</span>
      {showShortcuts ? <div className="basis-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300">Arrow: move 1px · Shift+Arrow: 10px · Ctrl+Arrow: fine move · +/-: view zoom · R: rotate 90° · Shift+R: rotate -90° · Alt: disable snapping</div> : null}
    </div>
    <div ref={workspaceRef} tabIndex={0} onKeyDown={handleKeyDown} onFocus={() => setEditorFocused(true)} onBlur={() => setEditorFocused(false)} className="relative flex h-[calc(100vh-250px)] min-h-[520px] items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#172033] p-6 shadow-inner">
      <div className="relative shrink-0 rounded-lg border border-slate-500/70 bg-slate-950 shadow-2xl" style={{ width: displayWidth, height: displayHeight }}>
        <canvas ref={canvasElement} style={{ width: displayWidth, height: displayHeight }} />
        {guides.vertical !== undefined ? <div className="pointer-events-none absolute bottom-0 top-0 border-l-2 border-emerald-400" style={{ left: guides.vertical * displayScale }} /> : null}
        {guides.horizontal !== undefined ? <div className="pointer-events-none absolute left-0 right-0 border-t-2 border-emerald-400" style={{ top: guides.horizontal * displayScale }} /> : null}
        <div className="pointer-events-none absolute inset-0 border-2 border-red-400/80" /><div className="pointer-events-none absolute inset-0 border border-dashed border-amber-400/70" style={{ margin: safeArea * displayScale }} /><div className="pointer-events-none absolute inset-0 border border-dashed border-violet-400/70" style={{ margin: bleed * displayScale }} /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="h-full border-l border-dashed border-blue-400/50" /><span className="absolute w-full border-t border-dashed border-blue-400/50" /></div>
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 text-[10px] leading-4 text-slate-200">Red: print edge · Yellow: safe area · Purple: bleed · Blue: centre</div>
      </div>
    </div>
  </div>;
}
