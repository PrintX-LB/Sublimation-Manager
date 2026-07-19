"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActiveSelection,
  Canvas,
  FabricImage,
  Group,
  Rect,
  IText,
} from "fabric";

export interface ContourSettings {
  enabled: boolean;
  type: "rectangle" | "silhouette" | "canvas";
  colour: string;
  thicknessMm: number;
  offsetMm: number;
}

export interface ArtworkSavedState {
  zoom: number;
  rotation: number;
  positionX: number;
  positionY: number;
  documentJson?: string;
  contour?: ContourSettings;
}

interface ArtworkEditorProps {
  src: string;
  width: number;
  height: number;
  safeArea?: number;
  bleed?: number;
  dpi?: number;
  savedState?: ArtworkSavedState;
  onExport?: (
    dataUrl: string,
    settings: {
      zoom: number;
      rotation: number;
      positionX: number;
      positionY: number;
    },
    exportFiles?: { withContour: boolean; baseDataUrl: string },
  ) => void;
  onSave?: (
    documentJson: string,
    settings: {
      zoom: number;
      rotation: number;
      positionX: number;
      positionY: number;
    },
  ) => Promise<void>;
  onPersistImage?: (file: File) => Promise<string>;
  exportPending?: boolean;
}

type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";
type Guides = { vertical?: number; horizontal?: number };
type HistoryEntry = { snapshot: string; label: string; timestamp: number };

export function ArtworkEditor({
  src,
  width,
  height,
  safeArea = 0,
  bleed = 0,
  dpi = 300,
  savedState,
  onExport,
  onSave,
  onPersistImage,
  exportPending = false,
}: ArtworkEditorProps) {
  const canvasElement = useRef<HTMLCanvasElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const savedJson = useRef<string | null>(null);
  const history = useRef<HistoryEntry[]>([]);
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
  const interactionRef = useRef<"rotate" | null>(null);
  const draggedLayer = useRef<import("fabric").FabricObject | null>(null);
  const clipboardLayer = useRef<import("fabric").FabricObject | null>(null);
  const bypassRotationSnapRef = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceSize, setWorkspaceSize] = useState({
    width: 1000,
    height: 620,
  });
  const [, setSelectedVersion] = useState(0);
  const [layerNameCounter, setLayerNameCounter] = useState(1);
  const [locked, setLocked] = useState(false);
  const [leftTab, setLeftTab] = useState<"properties" | "contour">(
    "properties",
  );
  const [rightTab, setRightTab] = useState<"layers" | "history">("layers");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([
    "#ffffff",
    "#000000",
    "#ff0000",
    "#00ff00",
    "#0000ff",
  ]);
  useEffect(() => {
    setLeftCollapsed(
      window.sessionStorage.getItem("printx-left-panel-collapsed") === "true",
    );
    setRightCollapsed(
      window.sessionStorage.getItem("printx-right-panel-collapsed") === "true",
    );
  }, []);
  useEffect(() => {
    window.sessionStorage.setItem(
      "printx-left-panel-collapsed",
      String(leftCollapsed),
    );
  }, [leftCollapsed]);
  useEffect(() => {
    window.sessionStorage.setItem(
      "printx-right-panel-collapsed",
      String(rightCollapsed),
    );
  }, [rightCollapsed]);
  const fallbackFonts = [
    "Arial",
    "Calibri",
    "Cambria",
    "Comic Sans MS",
    "Courier New",
    "Georgia",
    "Impact",
    "Segoe UI",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana",
  ];
  const [contour, setContour] = useState<ContourSettings>(
    savedState?.contour ?? {
      enabled: false,
      type: "rectangle",
      colour: "#000000",
      thicknessMm: 0.3,
      offsetMm: 0,
    },
  );
  const contourRef = useRef<ContourSettings>(contour);
  contourRef.current = contour;
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
  const displayScale = Math.min(
    Math.max((workspaceSize.width - 48) / width, 0.05),
    Math.max((workspaceSize.height - 48) / height, 0.05),
    1,
  );
  const displayScaleRef = useRef(displayScale);
  displayScaleRef.current = displayScale;
  const displayWidth = Math.round(width * displayScale);
  const displayHeight = Math.round(height * displayScale);
  useEffect(() => {
    const canvas = fabricCanvas.current;
    const element = canvasElement.current;
    if (!canvas || !element) return;
    const root = element.parentElement;
    if (!root) return;
    for (const layer of [element, ...Array.from(root.querySelectorAll<HTMLCanvasElement>(".upper-canvas"))]) {
      layer.style.width = `${displayWidth}px`;
      layer.style.height = `${displayHeight}px`;
      layer.style.display = "block";
    }
    canvas.calcOffset();
    canvas.requestRenderAll();
  }, [displayWidth, displayHeight]);
  const selectedObject = fabricCanvas.current?.getActiveObject();
  const selectedBounds = selectedObject?.getBoundingRect();
  const selectedImage =
    selectedObject instanceof FabricImage ? selectedObject : null;
  const selectedWidth = selectedBounds?.width ?? 0;
  const selectedHeight = selectedBounds?.height ?? 0;
  const selectedLeft = selectedBounds?.left ?? 0;
  const selectedTop = selectedBounds?.top ?? 0;
  const naturalWidth = selectedImage
    ? ((selectedImage.getElement() as HTMLImageElement).naturalWidth ?? 0)
    : 0;
  const estimatedDpi =
    selectedWidth > 0 ? naturalWidth / (selectedWidth / dpi) : 0;
  const bleedCovered =
    !bleed ||
    (!!selectedBounds &&
      selectedLeft <= bleed &&
      selectedTop <= bleed &&
      selectedLeft + selectedWidth >= width - bleed &&
      selectedTop + selectedHeight >= height - bleed);
  const outsideSafe =
    !!selectedBounds &&
    safeArea > 0 &&
    (selectedLeft < safeArea ||
      selectedTop < safeArea ||
      selectedLeft + selectedWidth > width - safeArea ||
      selectedTop + selectedHeight > height - safeArea);
  const lowResolution = estimatedDpi > 0 && estimatedDpi < dpi;
  const contourObject = useRef<Rect | null>(null);
  const layerObjects = (fabricCanvas.current?.getObjects() ?? [])
    .filter((object) => object !== contourObject.current)
    .slice()
    .reverse();
  const layerName = (object: import("fabric").FabricObject) =>
    String(
      object.get("name") ?? (object instanceof FabricImage ? "Image" : "Text"),
    );
  const mmToCanvas = (mm: number) => (mm / 25.4) * dpi;
  const updateContourPreview = () => {
    const canvas = fabricCanvas.current;
    const object =
      canvas?.getActiveObject() ??
      canvas?.getObjects().find((item) => item !== contourObject.current);
    if (!canvas) return;
    if (contourObject.current) canvas.remove(contourObject.current);
    contourObject.current = null;
    if (
      !contourRef.current.enabled ||
      (contourRef.current.type !== "canvas" && !object)
    ) {
      canvas.requestRenderAll();
      return;
    }
    const offset = mmToCanvas(contourRef.current.offsetMm);
    const rect = new Rect({
      name: "__printx_contour",
      left: contourRef.current.type === "canvas" ? width / 2 : object?.left,
      top: contourRef.current.type === "canvas" ? height / 2 : object?.top,
      originX:
        contourRef.current.type === "canvas" ? "center" : object?.originX,
      originY:
        contourRef.current.type === "canvas" ? "center" : object?.originY,
      width:
        contourRef.current.type === "canvas"
          ? Math.max(1, width - offset * 2)
          : (object?.width ?? 0) + offset * 2,
      height:
        contourRef.current.type === "canvas"
          ? Math.max(1, height - offset * 2)
          : (object?.height ?? 0) + offset * 2,
      scaleX: contourRef.current.type === "canvas" ? 1 : object?.scaleX,
      scaleY: contourRef.current.type === "canvas" ? 1 : object?.scaleY,
      angle: contourRef.current.type === "canvas" ? 0 : object?.angle,
      fill: "transparent",
      stroke: contourRef.current.colour,
      strokeWidth: mmToCanvas(contourRef.current.thicknessMm),
      selectable: false,
      evented: false,
      excludeFromExport: true,
      objectCaching: false,
    });
    contourObject.current = rect;
    canvas.add(rect);
    canvas.sendObjectToBack(rect);
    canvas.requestRenderAll();
  };
  useEffect(() => {
    const element = canvasElement.current;
    if (!element) return;
    const canvasElementRoot = element.parentElement;
    if (!canvasElementRoot) return;
    for (const layer of [
      element,
      ...Array.from(
        canvasElementRoot.querySelectorAll<HTMLCanvasElement>(".upper-canvas"),
      ),
    ]) {
      layer.style.width = `${displayWidth}px`;
      layer.style.height = `${displayHeight}px`;
      layer.style.display = "block";
    }
    fabricCanvas.current?.requestRenderAll();
  }, [displayWidth, displayHeight]);

  useEffect(() => {
    const stored = window.localStorage.getItem("printx-artwork-snapping");
    if (stored === "false") setSnapping(false);
  }, []);
  useEffect(() => {
    snappingRef.current = snapping;
  }, [snapping]);

  const serialise = () => {
    const document = fabricCanvas.current?.toJSON() as
      { version?: string; objects?: Array<{ name?: string }> } | undefined;
    return JSON.stringify({
      version: document?.version ?? "7",
      objects: (document?.objects ?? []).filter(
        (object) => object.name !== "__printx_contour",
      ),
      printxContour: contourRef.current,
    });
  };
  const transform = () => {
    const object = fabricCanvas.current?.getObjects()[0];
    return {
      zoom: object?.scaleX ?? zoom,
      rotation: object?.angle ?? rotation,
      positionX: object?.left ?? width / 2,
      positionY: object?.top ?? height / 2,
    };
  };
  const markDirty = (label = "Changed document") => {
    if (restoring.current) return;
    const json = serialise();
    if (history.current[historyIndex.current]?.snapshot !== json) {
      history.current = history.current
        .slice(0, historyIndex.current + 1)
        .concat({ snapshot: json, label, timestamp: Date.now() })
        .slice(-50);
      historyIndex.current = history.current.length - 1;
      setStatus("dirty");
    }
  };
  const restoreHistory = async (index: number) => {
    const canvas = fabricCanvas.current;
    const snapshot = history.current[index]?.snapshot;
    if (!canvas || !snapshot || index < 0 || index >= history.current.length)
      return;
    restoring.current = true;
    await canvas.loadFromJSON(JSON.parse(snapshot));
    historyIndex.current = index;
    restoring.current = false;
    canvas.requestRenderAll();
    updateContourPreview();
    refreshSelection();
    setStatus("dirty");
  };
  const undo = () => {
    if (historyIndex.current > 0) void restoreHistory(historyIndex.current - 1);
  };
  const redo = () => {
    if (historyIndex.current < history.current.length - 1)
      void restoreHistory(historyIndex.current + 1);
  };
  const refreshSelection = () => {
    const object = fabricCanvas.current?.getActiveObject();
    setLocked(
      Boolean(
        object?.lockMovementX &&
        object.lockMovementY &&
        object.lockScalingX &&
        object.lockScalingY &&
        object.lockRotation,
      ),
    );
    setSelectedVersion((value) => value + 1);
  };
  const updateSelected = (changes: Record<string, number | boolean>) => {
    const object = fabricCanvas.current?.getActiveObject();
    if (!object || locked) return;
    object.set(changes);
    object.setCoords();
    fabricCanvas.current?.requestRenderAll();
    markDirty();
    refreshSelection();
  };
  const numericChange = (
    property: "left" | "top" | "angle" | "scaleX" | "scaleY",
    value: number,
  ) => {
    const object = fabricCanvas.current?.getActiveObject();
    if (!object || !Number.isFinite(value) || locked) return;
    if (property === "scaleX" || property === "scaleY") {
      const baseWidth = object.width || 1;
      const baseHeight = object.height || 1;
      const scale = Math.max(
        0.01,
        value / (property === "scaleX" ? baseWidth : baseHeight),
      );
      object.set({ scaleX: scale, scaleY: scale });
    } else if (property === "left" || property === "top") {
      const bounds = object.getBoundingRect();
      const current = property === "left" ? bounds.left : bounds.top;
      object.set(property, (object.get(property) as number) + value - current);
    } else object.set(property, value);
    object.setCoords();
    fabricCanvas.current?.requestRenderAll();
    markDirty();
    refreshSelection();
  };
  const alignSelected = (
    direction: "left" | "right" | "top" | "bottom" | "centerX" | "centerY",
  ) => {
    const object = fabricCanvas.current?.getActiveObject();
    if (!object || locked) return;
    const bounds = object.getBoundingRect();
    const next =
      direction === "left"
        ? (object.left ?? 0) - bounds.left
        : direction === "right"
          ? (object.left ?? 0) + width - bounds.left - bounds.width
          : direction === "top"
            ? (object.top ?? 0) - bounds.top
            : direction === "bottom"
              ? (object.top ?? 0) + height - bounds.top - bounds.height
              : direction === "centerX"
                ? (object.left ?? 0) +
                  width / 2 -
                  (bounds.left + bounds.width / 2)
                : (object.top ?? 0) +
                  height / 2 -
                  (bounds.top + bounds.height / 2);
    object.set(
      direction === "left" || direction === "right" || direction === "centerX"
        ? { left: next }
        : { top: next },
    );
    object.setCoords();
    fabricCanvas.current?.requestRenderAll();
    markDirty();
    refreshSelection();
  };

  useEffect(() => {
    if (!canvasElement.current) return;
    const canvas = new Canvas(canvasElement.current, {
      width,
      height,
      preserveObjectStacking: true,
      selection: true,
      uniformScaling: true,
    });
    fabricCanvas.current = canvas;
    let cancelled = false;
    const initialise = async () => {
      const image = await FabricImage.fromURL(src, {
        crossOrigin: "anonymous",
      });
      if (cancelled) return;
      restoring.current = true;
      if (savedState?.documentJson) {
        const savedDocument = JSON.parse(savedState.documentJson) as {
          printxContour?: ContourSettings;
        };
        if (savedDocument.printxContour) {
          setContour(savedDocument.printxContour);
          contourRef.current = savedDocument.printxContour;
        }
        await canvas.loadFromJSON(savedDocument);
      } else {
        image.set({
          originX: "center",
          originY: "center",
          left: width / 2,
          top: height / 2,
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
          lockScalingX: false,
          lockScalingY: false,
          lockRotation: false,
          cornerSize: 14,
          touchCornerSize: 28,
          transparentCorners: false,
          centeredRotation: true,
          objectCaching: false,
        });
        image.scaleToWidth(width);
        canvas.add(image);
      }
      canvas.getObjects().forEach((object) =>
        object.set({
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
          cornerSize: 14,
          touchCornerSize: 28,
          transparentCorners: false,
          centeredRotation: true,
          objectCaching: false,
        }),
      );
      savedJson.current = serialise();
      history.current = [
        {
          snapshot: savedJson.current,
          label: "Opened document",
          timestamp: Date.now(),
        },
      ];
      historyIndex.current = 0;
      const root = canvasElement.current?.parentElement;
      if (root) {
        for (const layer of [
          canvasElement.current,
          ...Array.from(
            root.querySelectorAll<HTMLCanvasElement>(".upper-canvas"),
          ),
        ]) {
          if (layer) {
            layer.style.width = `${displayWidth}px`;
            layer.style.height = `${displayHeight}px`;
            layer.style.display = "block";
          }
        }
      }
      canvas.calcOffset();
      canvas.requestRenderAll();
      updateContourPreview();
      restoring.current = false;
      setReady(true);
      setStatus("clean");
      if (process.env.NODE_ENV === "development")
        console.debug("Artwork editor loaded", {
          template: [width, height],
          preview: [displayWidth, displayHeight],
          restored: Boolean(savedState?.documentJson),
        });
    };
    const snapObject = (
      object: import("fabric").FabricObject,
      event: Event | undefined,
    ) => {
      if (!snappingRef.current || (event as MouseEvent | undefined)?.altKey) {
        setGuides({});
        return;
      }
      const bounds = object.getBoundingRect();
      const tolerance = 8 / displayScaleRef.current;
      const xPoints = [0, width / 2, width];
      const yPoints = [0, height / 2, height];
      if (safeArea > 0) {
        xPoints.push(safeArea, width - safeArea);
        yPoints.push(safeArea, height - safeArea);
      }
      if (bleed > 0) {
        xPoints.push(bleed, width - bleed);
        yPoints.push(bleed, height - bleed);
      }
      const xValues = [
        bounds.left,
        bounds.left + bounds.width / 2,
        bounds.left + bounds.width,
      ];
      const yValues = [
        bounds.top,
        bounds.top + bounds.height / 2,
        bounds.top + bounds.height,
      ];
      const nearest = (
        values: number[],
        points: number[],
      ): { delta: number; point: number } | null => {
        const candidates = values.flatMap((value) =>
          points.map((point) => ({ delta: point - value, point })),
        );
        const candidate = candidates
          .filter((item) => Math.abs(item.delta) <= tolerance)
          .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
        return candidate ?? null;
      };
      const xSnap = nearest(xValues, xPoints);
      const ySnap = nearest(yValues, yPoints);
      if (xSnap) object.left = (object.left ?? 0) + xSnap.delta;
      if (ySnap) object.top = (object.top ?? 0) + ySnap.delta;
      object.setCoords();
      setGuides({ vertical: xSnap?.point, horizontal: ySnap?.point });
    };
    const moving = (event: {
      target?: import("fabric").FabricObject;
      e?: Event;
    }) => {
      if (event.target) snapObject(event.target, event.e);
    };
    const rotating = (event: {
      target?: import("fabric").FabricObject;
      e?: Event;
    }) => {
      if (event.target) {
        interactionRef.current = "rotate";
        bypassRotationSnapRef.current = Boolean(
          (event.e as MouseEvent | undefined)?.altKey,
        );
      }
      setGuides({});
    };
    const changed = () => {
      const object = canvas.getActiveObject();
      if (
        object &&
        interactionRef.current === "rotate" &&
        snappingRef.current &&
        !bypassRotationSnapRef.current
      ) {
        const angle = (((object.angle ?? 0) % 360) + 360) % 360;
        const snapAngle = Math.round(angle / 45) * 45;
        if (Math.abs(snapAngle - angle) <= 7)
          object.set({ angle: snapAngle % 360 });
        object.setCoords();
      }
      interactionRef.current = null;
      setGuides({});
      updateContourPreview();
      markDirty();
      refreshSelection();
    };
    canvas.on("object:moving", moving);
    canvas.on("object:rotating", rotating);
    canvas.on("object:modified", changed);
    canvas.on("selection:created", refreshSelection);
    canvas.on("selection:updated", refreshSelection);
    canvas.on("selection:cleared", refreshSelection);
    canvas.on("object:scaling", refreshSelection);
    canvas.on("object:moving", refreshSelection);
    canvas.on("object:rotating", refreshSelection);
    void initialise();
    return () => {
      cancelled = true;
      canvas.off("object:moving", moving);
      canvas.off("object:rotating", rotating);
      canvas.off("object:modified", changed);
      canvas.off("selection:created", refreshSelection);
      canvas.off("selection:updated", refreshSelection);
      canvas.off("selection:cleared", refreshSelection);
      canvas.off("object:scaling", refreshSelection);
      canvas.off("object:moving", refreshSelection);
      canvas.off("object:rotating", refreshSelection);
      canvas.dispose();
      fabricCanvas.current = null;
    };
    // The Fabric canvas must only be recreated when the source/template changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, width, height, safeArea, bleed]);

  const applyScale = (value: number) => {
    const object = fabricCanvas.current?.getObjects()[0];
    if (!object) return;
    object.set({ scaleX: value, scaleY: value });
    object.setCoords();
    setZoom(value);
    fabricCanvas.current?.requestRenderAll();
    markDirty();
  };
  const applyRotation = (value: number) => {
    const object = fabricCanvas.current?.getObjects()[0];
    if (!object) return;
    object.rotate(value);
    object.setCoords();
    setRotation(value);
    fabricCanvas.current?.requestRenderAll();
    markDirty();
  };
  const center = (record = true) => {
    const object = fabricCanvas.current?.getObjects()[0];
    if (!object) return;
    const bounds = object.getBoundingRect();
    object.set({
      left: (object.left ?? 0) + width / 2 - (bounds.left + bounds.width / 2),
      top: (object.top ?? 0) + height / 2 - (bounds.top + bounds.height / 2),
    });
    object.setCoords();
    fabricCanvas.current?.requestRenderAll();
    if (record) markDirty();
  };
  const fitOrFill = (fillTemplate: boolean) => {
    const object = fabricCanvas.current?.getObjects()[0];
    if (!object) return;
    const bounds = object.getBoundingRect();
    const factor = fillTemplate
      ? Math.max(width / bounds.width, height / bounds.height)
      : Math.min(width / bounds.width, height / bounds.height);
    object.set({
      scaleX: (object.scaleX ?? 1) * factor,
      scaleY: (object.scaleY ?? 1) * factor,
    });
    object.setCoords();
    center(false);
    setZoom(object.scaleX ?? 1);
    markDirty();
  };
  const fit = () => fitOrFill(false);
  const fill = () => fitOrFill(true);
  const reset = () => {
    fit();
    applyRotation(0);
  };
  const toggleLock = () => {
    const object = fabricCanvas.current?.getActiveObject();
    if (!object) return;
    const next = !locked;
    object.set({
      lockMovementX: next,
      lockMovementY: next,
      lockScalingX: next,
      lockScalingY: next,
      lockRotation: next,
      hasControls: true,
      selectable: true,
      evented: true,
    });
    setLocked(next);
    fabricCanvas.current?.requestRenderAll();
    markDirty();
  };
  const flipSelected = (axis: "x" | "y") => {
    const object = fabricCanvas.current?.getActiveObject();
    if (!object || locked) return;
    object.set(
      axis === "x" ? { flipX: !object.flipX } : { flipY: !object.flipY },
    );
    object.setCoords();
    fabricCanvas.current?.requestRenderAll();
    markDirty();
    refreshSelection();
  };
  const changeContour = (changes: Partial<ContourSettings>) => {
    const next = { ...contourRef.current, ...changes };
    contourRef.current = next;
    setContour(next);
    updateContourPreview();
    markDirty();
  };
  const addImageFile = async (file: File) => {
    const canvas = fabricCanvas.current;
    if (!canvas || !file.type.startsWith("image/")) return;
    const url = onPersistImage
      ? await onPersistImage(file)
      : URL.createObjectURL(file);
    try {
      const image = await FabricImage.fromURL(url);
      image.set({
        name: `Image ${layerNameCounter}`,
        originX: "center",
        originY: "center",
        left: width / 2,
        top: height / 2,
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        objectCaching: false,
      });
      image.scaleToWidth(Math.min(width * 0.5, image.width ?? width));
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.requestRenderAll();
      setLayerNameCounter((value) => value + 1);
      markDirty();
      refreshSelection();
    } finally {
      if (!onPersistImage) URL.revokeObjectURL(url);
    }
  };
  const addTextLayer = () => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const text = new IText("New text", {
      name: `Text ${layerNameCounter}`,
      left: width / 2,
      top: height / 2,
      originX: "center",
      originY: "center",
      fill: "#ffffff",
      fontSize: Math.max(24, Math.round(width / 20)),
      selectable: true,
      evented: true,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
    setLayerNameCounter((value) => value + 1);
    markDirty();
    refreshSelection();
  };
  const updateLayer = (
    object: import("fabric").FabricObject,
    changes: Record<string, unknown>,
    label = "Changed layer",
  ) => {
    object.set(changes);
    object.setCoords();
    fabricCanvas.current?.requestRenderAll();
    markDirty(label);
    refreshSelection();
  };
  const changeTextColour = (object: IText, colour: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(colour)) return;
    updateLayer(object, { fill: colour }, "Changed text colour");
    setRecentColors((colors) =>
      [
        colour,
        ...colors.filter(
          (value) => value.toLowerCase() !== colour.toLowerCase(),
        ),
      ].slice(0, 8),
    );
  };
  const deleteLayer = (object: import("fabric").FabricObject) => {
    if (!window.confirm(`Delete layer “${layerName(object)}”?`)) return;
    fabricCanvas.current?.remove(object);
    fabricCanvas.current?.discardActiveObject();
    fabricCanvas.current?.requestRenderAll();
    markDirty(`Deleted ${layerName(object)}`);
    refreshSelection();
  };
  const moveLayer = (
    object: import("fabric").FabricObject,
    direction: "forward" | "backward",
  ) => {
    if (direction === "forward")
      fabricCanvas.current?.bringObjectForward(object);
    else fabricCanvas.current?.sendObjectBackwards(object);
    fabricCanvas.current?.requestRenderAll();
    markDirty();
    refreshSelection();
  };
  const reorderLayer = (target: import("fabric").FabricObject) => {
    const canvas = fabricCanvas.current;
    const source = draggedLayer.current;
    if (!canvas || !source || source === target) return;
    canvas.moveObjectTo(source, canvas.getObjects().indexOf(target));
    draggedLayer.current = null;
    canvas.requestRenderAll();
    markDirty();
    refreshSelection();
  };
  const duplicateLayer = async (object: import("fabric").FabricObject) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const clone = await object.clone();
    clone.set({
      name: `${layerName(object)} copy`,
      left: (object.left ?? 0) + 20,
      top: (object.top ?? 0) + 20,
      selectable: true,
      evented: true,
    });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    canvas.requestRenderAll();
    markDirty();
    refreshSelection();
  };
  const duplicateSelected = async () => {
    const object = fabricCanvas.current?.getActiveObject();
    if (object) await duplicateLayer(object);
  };
  const copySelected = async () => {
    const object = fabricCanvas.current?.getActiveObject();
    if (object) clipboardLayer.current = await object.clone();
  };
  const pasteSelected = async () => {
    const canvas = fabricCanvas.current;
    const source = clipboardLayer.current;
    if (!canvas || !source) return;
    const clone = await source.clone();
    clone.set({
      left: (source.left ?? 0) + 24,
      top: (source.top ?? 0) + 24,
      name: `${layerName(source)} copy`,
      selectable: true,
      evented: true,
    });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    canvas.requestRenderAll();
    markDirty("Pasted layer");
    refreshSelection();
  };
  const groupSelected = () => {
    const canvas = fabricCanvas.current;
    const active = canvas?.getActiveObject();
    if (
      !canvas ||
      !(active instanceof ActiveSelection) ||
      active.getObjects().length < 2
    )
      return;
    const objects = active.getObjects();
    const count = objects.length;
    canvas.remove(active);
    const group = new Group(objects);
    group.set({ name: `Group ${count}` });
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    markDirty(`Grouped ${count} objects`);
    refreshSelection();
  };
  const ungroupSelected = () => {
    const canvas = fabricCanvas.current;
    const active = canvas?.getActiveObject();
    if (
      !canvas ||
      !(active instanceof Group) ||
      active instanceof ActiveSelection
    )
      return;
    const objects = active.getObjects();
    canvas.remove(active);
    objects.forEach((object) => canvas.add(object));
    const selection = new ActiveSelection(objects, { canvas });
    canvas.setActiveObject(selection);
    canvas.requestRenderAll();
    markDirty("Ungrouped objects");
    refreshSelection();
  };
  const save = async () => {
    if (!onSave || status === "saving") return;
    setStatus("saving");
    try {
      const json = serialise();
      await onSave(json, transform());
      savedJson.current = json;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };
  const exportArtwork = (withContour = false) => {
    const canvas = fabricCanvas.current;
    if (!canvas || exportPending) return;
    const preview = contourObject.current;
    if (preview) canvas.remove(preview);
    canvas.requestRenderAll();
    const baseDataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
    let exportContour: Rect | null = null;
    if (withContour && contourRef.current.enabled) {
      const object = canvas.getActiveObject() ?? canvas.getObjects()[0];
      if (object || contourRef.current.type === "canvas") {
        const offset = mmToCanvas(contourRef.current.offsetMm);
        exportContour = new Rect({
          left: contourRef.current.type === "canvas" ? width / 2 : object?.left,
          top: contourRef.current.type === "canvas" ? height / 2 : object?.top,
          originX:
            contourRef.current.type === "canvas" ? "center" : object?.originX,
          originY:
            contourRef.current.type === "canvas" ? "center" : object?.originY,
          width:
            contourRef.current.type === "canvas"
              ? Math.max(1, width - offset * 2)
              : (object?.width ?? 0) + offset * 2,
          height:
            contourRef.current.type === "canvas"
              ? Math.max(1, height - offset * 2)
              : (object?.height ?? 0) + offset * 2,
          scaleX: contourRef.current.type === "canvas" ? 1 : object?.scaleX,
          scaleY: contourRef.current.type === "canvas" ? 1 : object?.scaleY,
          angle: contourRef.current.type === "canvas" ? 0 : object?.angle,
          fill: "transparent",
          stroke: contourRef.current.colour,
          strokeWidth: mmToCanvas(contourRef.current.thicknessMm),
          selectable: false,
          evented: false,
          objectCaching: false,
        });
        canvas.add(exportContour);
        canvas.sendObjectToBack(exportContour);
      }
    }
    canvas.requestRenderAll();
    const dataUrl = withContour
      ? canvas.toDataURL({ format: "png", multiplier: 1 })
      : baseDataUrl;
    onExport?.(dataUrl, transform(), { withContour, baseDataUrl });
    if (exportContour) canvas.remove(exportContour);
    updateContourPreview();
  };
  const groupKeyboardChange = () => {
    if (keyboardTimer.current) clearTimeout(keyboardTimer.current);
    keyboardTimer.current = setTimeout(() => {
      setGuides({});
      markDirty();
    }, 180);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (
      target.matches(
        "input, textarea, select, [contenteditable='true'], button",
      )
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void duplicateSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      void pasteSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
      event.preventDefault();
      if (event.shiftKey) ungroupSelected();
      else groupSelected();
      return;
    }
    if (event.key === "Escape") {
      fabricCanvas.current?.discardActiveObject();
      fabricCanvas.current?.requestRenderAll();
      refreshSelection();
      return;
    }
    const object = fabricCanvas.current?.getActiveObject();
    if (!fabricCanvas.current || !object) return;
    if (event.key === "Delete") {
      event.preventDefault();
      deleteLayer(object);
      return;
    }
    if (
      ["+", "=", "-", "_"].includes(event.key) &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      applyScale(
        Math.min(
          4,
          Math.max(
            0.1,
            (object.scaleX ?? 1) +
              (event.key === "+" || event.key === "=" ? 0.1 : -0.1),
          ),
        ),
      );
      return;
    }
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      event.preventDefault();
      const amount = event.ctrlKey ? 0.25 : event.shiftKey ? 10 : 1;
      const dx =
        event.key === "ArrowLeft"
          ? -amount
          : event.key === "ArrowRight"
            ? amount
            : 0;
      const dy =
        event.key === "ArrowUp"
          ? -amount
          : event.key === "ArrowDown"
            ? amount
            : 0;
      object.set({
        left: (object.left ?? 0) + dx,
        top: (object.top ?? 0) + dy,
      });
      object.setCoords();
      fabricCanvas.current.requestRenderAll();
      setStatus("dirty");
      groupKeyboardChange();
      return;
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      const next =
        ((((object.angle ?? 0) + (event.shiftKey ? -90 : 90)) % 360) + 360) %
        360;
      object.rotate(next);
      object.setCoords();
      fabricCanvas.current.requestRenderAll();
      setRotation(next);
      setStatus("dirty");
      groupKeyboardChange();
    }
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-2 overflow-hidden ${editorFocused ? "outline outline-1 outline-emerald-500/50" : ""}`}
      onMouseDown={(event) => {
        // Keep native focus inside toolbar/panel controls. Focusing the
        // workspace from the outer shell previously stole focus from selects
        // and numeric inputs before their change/click handlers completed.
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, select, button, [contenteditable='true']")) return;
        workspaceRef.current?.focus();
      }}
    >
      <div className="scroll-mt-24 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm">
        <input
          ref={imageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void addImageFile(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Add Image
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={historyIndex.current <= 0}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={historyIndex.current >= history.current.length - 1}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={addTextLayer}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Add Text
        </button>
        <button
          type="button"
          onClick={groupSelected}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Group
        </button>
        <button
          type="button"
          onClick={ungroupSelected}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Ungroup
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!ready || status === "saving"}
          className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => applyScale(Math.max(0.1, zoom - 0.01))}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Zoom −
        </button>
        <label className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1 text-xs">
          Zoom {Math.round(zoom * 100)}%
          <input
            aria-label="Zoom"
            type="range"
            min="10"
            max="400"
            step="1"
            value={Math.round(zoom * 100)}
            onChange={(e) => applyScale(Number(e.target.value) / 100)}
          />
        </label>
        <label className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1 text-xs">
          Rotate {Math.round(rotation)}°
          <input
            aria-label="Rotation"
            type="range"
            min="-180"
            max="180"
            step="1"
            value={Math.round(rotation)}
            onChange={(e) => applyRotation(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const next = !snapping;
            setSnapping(next);
            snappingRef.current = next;
            window.localStorage.setItem(
              "printx-artwork-snapping",
              String(next),
            );
          }}
          className="rounded border border-slate-700 px-3 py-1 text-xs"
        >
          Snapping: {snapping ? "On" : "Off"}
        </button>
        <span className="text-xs text-slate-400">
          Hold Alt to disable snapping.
        </span>
        <button
          type="button"
          onClick={() => applyScale(Math.min(4, zoom + 0.01))}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Zoom +
        </button>
        <button
          type="button"
          onClick={fit}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={fill}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Fill
        </button>
        <button
          type="button"
          onClick={() => center()}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Centre
        </button>
        <button
          type="button"
          onClick={() => applyRotation(rotation + 45)}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Rotate
        </button>
        <button
          type="button"
          onClick={() => flipSelected("x")}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Flip H
        </button>
        <button
          type="button"
          onClick={() => flipSelected("y")}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Flip V
        </button>
        <button
          type="button"
          onClick={toggleLock}
          className="rounded border border-slate-700 px-3 py-1"
        >
          {locked ? "Unlock" : "Lock"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => changeContour({ enabled: !contour.enabled })}
          className="rounded border border-slate-700 px-3 py-1"
        >
          Cut Contour: {contour.enabled ? "On" : "Off"}
        </button>
        <button
          type="button"
          onClick={() => exportArtwork(false)}
          disabled={!ready || exportPending}
          className="ml-auto rounded border border-slate-700 px-3 py-1"
        >
          Export without contour
        </button>
        <button
          type="button"
          onClick={() => exportArtwork(true)}
          disabled={!ready || exportPending || !contour.enabled}
          className="rounded bg-brand-600 px-3 py-1 font-semibold text-white"
        >
          Export with contour
        </button>
        <button
          type="button"
          onClick={() => setShowShortcuts((value) => !value)}
          className="rounded border border-slate-700 px-2 py-1 text-xs"
        >
          Keyboard ?
        </button>
        <span className="text-xs text-slate-400">
          {status === "dirty"
            ? "Unsaved changes"
            : status === "saved"
              ? "Saved"
              : status === "error"
                ? "Save failed"
                : ""}
        </span>
        {showShortcuts ? (
          <div className="basis-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300">
            Arrow: move 1px · Shift+Arrow: 10px · Ctrl+Arrow: fine move · +/-:
            view zoom · R: rotate 90° · Shift+R: rotate -90° · Alt: disable
            snapping
          </div>
        ) : null}
      </div>
      <div
        className={`grid min-h-0 flex-1 gap-2 overflow-hidden ${leftCollapsed && rightCollapsed ? "lg:grid-cols-[minmax(0,1fr)]" : leftCollapsed ? "lg:grid-cols-[minmax(0,1fr)_280px]" : rightCollapsed ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)_280px]"}`}
      >
        {!leftCollapsed ? (
          <aside className="hidden min-h-0 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300 lg:block">
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setLeftTab("properties")}
                  className={`rounded px-2 py-1 ${leftTab === "properties" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400"}`}
                >
                  Properties
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab("contour")}
                  className={`rounded px-2 py-1 ${leftTab === "contour" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400"}`}
                >
                  Cut Contour
                </button>
              </div>
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                aria-label="Collapse left panel"
                title="Collapse left panel"
                className="min-h-9 min-w-9 rounded text-lg hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                ‹
              </button>
            </div>
            <p className="mt-4 text-slate-400">
              {leftTab === "properties"
                ? selectedObject
                  ? `Selected: ${layerName(selectedObject)}`
                  : "Select a layer to edit properties."
                : "Contour settings are available in the Properties area."}
            </p>
            {leftTab === "properties" && selectedObject ? (
              <div className="mt-3 space-y-2">
                <label className="block">
                  X
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1"
                    type="number"
                    value={Math.round(selectedLeft)}
                    onChange={(event) =>
                      numericChange("left", Number(event.target.value))
                    }
                  />
                </label>
                <label className="block">
                  Y
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1"
                    type="number"
                    value={Math.round(selectedTop)}
                    onChange={(event) =>
                      numericChange("top", Number(event.target.value))
                    }
                  />
                </label>
                <label className="block">
                  Opacity
                  <input
                    className="mt-1 w-full"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedObject.opacity ?? 1}
                    onChange={(event) =>
                      updateSelected({ opacity: Number(event.target.value) })
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => flipSelected("x")}
                  className="mr-1 rounded border border-slate-700 px-2 py-1"
                >
                  Flip H
                </button>
                <button
                  type="button"
                  onClick={() => flipSelected("y")}
                  className="rounded border border-slate-700 px-2 py-1"
                >
                  Flip V
                </button>
              </div>
            ) : null}
            {leftTab === "contour" ? (
              <div className="mt-3 space-y-2">
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={contour.enabled}
                    onChange={(event) =>
                      changeContour({ enabled: event.target.checked })
                    }
                  />{" "}
                  Enabled
                </label>
                <label className="block">
                  Type
                  <select
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1"
                    value={contour.type}
                    onChange={(event) =>
                      changeContour({
                        type: event.target.value as ContourSettings["type"],
                      })
                    }
                  >
                    <option value="rectangle">Artwork rectangle</option>
                    <option value="silhouette">Silhouette</option>
                    <option value="canvas">Full canvas</option>
                  </select>
                </label>
                <label className="block">
                  Thickness (mm)
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1"
                    type="number"
                    value={contour.thicknessMm}
                    onChange={(event) =>
                      changeContour({ thicknessMm: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  Offset (mm)
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1"
                    type="number"
                    value={contour.offsetMm}
                    onChange={(event) =>
                      changeContour({ offsetMm: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
            ) : null}
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setLeftCollapsed(false)}
            className="hidden min-h-12 min-w-9 items-center justify-center rounded-r border border-slate-700 bg-slate-900 text-lg text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 lg:flex"
            aria-label="Expand left panel"
            title="Expand left panel"
          >
            ›
          </button>
        )}
        <div
          ref={workspaceRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onFocus={() => setEditorFocused(true)}
          onBlur={() => setEditorFocused(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void addImageFile(file);
          }}
          onPaste={(event) => {
            const file = Array.from(event.clipboardData.files)[0];
            if (file) void addImageFile(file);
          }}
          className="relative flex h-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#172033] p-3 shadow-inner"
        >
          <div
            className="relative shrink-0 rounded-lg border border-slate-500/70 bg-slate-950 shadow-2xl"
            style={{ width: displayWidth, height: displayHeight }}
          >
            <div className="pointer-events-none absolute -top-5 left-0 right-0 flex justify-between text-[9px] text-slate-400">
              {Array.from({ length: 11 }, (_, index) => (
                <span key={index}>
                  {Math.round(((width * index) / 10 / dpi) * 25.4)} mm
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute -left-12 bottom-0 top-0 flex flex-col justify-between text-[9px] text-slate-400">
              {Array.from({ length: 7 }, (_, index) => (
                <span key={index}>
                  {Math.round(((height * index) / 6 / dpi) * 25.4)} mm
                </span>
              ))}
            </div>
            <canvas
              ref={canvasElement}
              style={{ width: displayWidth, height: displayHeight }}
            />
            {guides.vertical !== undefined ? (
              <div
                className="pointer-events-none absolute bottom-0 top-0 border-l-2 border-emerald-400"
                style={{ left: guides.vertical * displayScale }}
              />
            ) : null}
            {guides.horizontal !== undefined ? (
              <div
                className="pointer-events-none absolute left-0 right-0 border-t-2 border-emerald-400"
                style={{ top: guides.horizontal * displayScale }}
              />
            ) : null}
            <div className="pointer-events-none absolute inset-0 border-2 border-red-400/80" />
            <div
              className="pointer-events-none absolute inset-0 border border-dashed border-amber-400/70"
              style={{ margin: safeArea * displayScale }}
            />
            <div
              className="pointer-events-none absolute inset-0 border border-dashed border-violet-400/70"
              style={{ margin: bleed * displayScale }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="h-full border-l border-dashed border-blue-400/50" />
              <span className="absolute w-full border-t border-dashed border-blue-400/50" />
            </div>
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 text-[10px] leading-4 text-slate-200">
              Red: print edge · Yellow: safe area · Purple: bleed · Blue: centre
            </div>
          </div>
        </div>
        {!rightCollapsed ? (
          <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
            <button
              type="button"
              onClick={() => setRightCollapsed(true)}
              className="float-right min-h-9 min-w-9 rounded text-lg text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Collapse right panel"
              title="Collapse right panel"
            >
              ›
            </button>
            <div className="mb-4 border-b border-slate-700 pb-3">
              <div className="mb-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setRightTab("layers")}
                  className={`rounded px-2 py-1 ${rightTab === "layers" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400"}`}
                >
                  Layers
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("history")}
                  className={`rounded px-2 py-1 ${rightTab === "history" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400"}`}
                >
                  History
                </button>
              </div>
              {rightTab === "history" ? (
                <div className="space-y-1">
                  {history.current.map((entry, index) => (
                    <button
                      type="button"
                      key={index}
                      onClick={() => void restoreHistory(index)}
                      className={`block w-full rounded px-2 py-1 text-left ${index === historyIndex.current ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:bg-slate-800"}`}
                    >
                      {entry.label} ·{" "}
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </button>
                  ))}
                </div>
              ) : null}
              {rightTab === "layers" ? (
                <>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Layers
                  </h2>
                <div className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-1">
                    {layerObjects.map((object, index) => {
                      const active = selectedObject === object;
                      const isLocked = Boolean(
                        object.lockMovementX &&
                        object.lockScalingX &&
                        object.lockRotation,
                      );
                      return (
                        <div
                          key={`${layerName(object)}-${index}`}
                          draggable
                          onDragStart={() => {
                            draggedLayer.current = object;
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => reorderLayer(object)}
                          className={`flex items-center gap-1 rounded px-2 py-1 ${active ? "bg-emerald-500/20" : "hover:bg-slate-800"}`}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left"
                            onClick={() => {
                              fabricCanvas.current?.setActiveObject(object);
                              fabricCanvas.current?.requestRenderAll();
                              refreshSelection();
                            }}
                          >
                            {object instanceof FabricImage ? "▧" : "T"}{" "}
                            {layerName(object)}
                          </button>
                          <button
                            type="button"
                            aria-label={`Toggle ${layerName(object)} visibility`}
                            title="Show or hide layer"
                            className="min-h-8 min-w-8 rounded hover:bg-slate-700"
                            onClick={() =>
                              updateLayer(object, {
                                visible: object.visible === false,
                              })
                            }
                          >
                            {object.visible === false ? "◌" : "◉"}
                          </button>
                          <button
                            type="button"
                            aria-label={`Toggle ${layerName(object)} lock`}
                            title="Lock or unlock layer"
                            className="min-h-8 min-w-8 rounded hover:bg-slate-700"
                            onClick={() =>
                              updateLayer(object, {
                                lockMovementX: !isLocked,
                                lockMovementY: !isLocked,
                                lockScalingX: !isLocked,
                                lockScalingY: !isLocked,
                                lockRotation: !isLocked,
                              })
                            }
                          >
                            {isLocked ? "🔒" : "🔓"}
                          </button>
                          <button
                            type="button"
                            aria-label={`Bring ${layerName(object)} forward`}
                            title="Move layer up"
                            className="hidden"
                            onClick={() => moveLayer(object, "forward")}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Send ${layerName(object)} backward`}
                            title="Move layer down"
                            className="hidden"
                            onClick={() => moveLayer(object, "backward")}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-label={`Duplicate ${layerName(object)}`}
                            title="Duplicate layer"
                            className="hidden"
                            onClick={() => void duplicateLayer(object)}
                          >
                            ＋
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${layerName(object)}`}
                            title="Delete layer"
                            className="hidden"
                            onClick={() => deleteLayer(object)}
                          >
                            ×
                          </button>
                          <div className="group relative">
                            <button
                              type="button"
                              aria-label={`More actions for ${layerName(object)}`}
                              title="More layer actions"
                              className="min-h-8 min-w-8 rounded text-lg hover:bg-slate-700"
                            >
                              ⋯
                            </button>
                            <div className="absolute right-0 top-9 z-50 hidden w-36 rounded border border-slate-700 bg-slate-950 p-1 shadow-xl group-focus-within:block">
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800"
                                onClick={() => moveLayer(object, "forward")}
                              >
                                Move up
                              </button>
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800"
                                onClick={() => moveLayer(object, "backward")}
                              >
                                Move down
                              </button>
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800"
                                onClick={() => void duplicateLayer(object)}
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left text-red-300 hover:bg-red-900/40"
                                onClick={() => deleteLayer(object)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
            <h2 className="text-sm font-semibold text-slate-100">Properties</h2>
            {!selectedObject ? (
              <p className="mt-3 text-slate-500">
                Select artwork to edit its properties.
              </p>
            ) : (
              <>
                <label className="mt-3 block space-y-1">
                  <span>Layer name</span>
                  <input
                    value={layerName(selectedObject)}
                    onChange={(event) =>
                      updateLayer(selectedObject, { name: event.target.value })
                    }
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                  />
                </label>
                {selectedObject instanceof IText ? (
                  <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
                    <label className="block space-y-1">
                      <span>Text</span>
                      <textarea
                        value={selectedObject.text ?? ""}
                        onChange={(event) =>
                          updateLayer(selectedObject, {
                            text: event.target.value,
                          })
                        }
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span>Font size</span>
                        <input
                          type="number"
                          value={selectedObject.fontSize ?? 24}
                          onChange={(event) =>
                            updateLayer(selectedObject, {
                              fontSize: Number(event.target.value),
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                        />
                      </label>
                      <label className="space-y-1">
                        <span>Font family</span>
                        <select
                          value={selectedObject.fontFamily ?? "Arial"}
                          onChange={(event) =>
                            updateLayer(selectedObject, {
                              fontFamily: event.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                        >
                          {fallbackFonts.map((font) => (
                            <option
                              key={font}
                              value={font}
                              style={{ fontFamily: font }}
                            >
                              {font}
                            </option>
                          ))}
                          <option value={selectedObject.fontFamily ?? "Arial"}>
                            {selectedObject.fontFamily ?? "Custom font"}
                          </option>
                        </select>
                      </label>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="300"
                      value={selectedObject.fontSize ?? 24}
                      onChange={(event) =>
                        updateLayer(
                          selectedObject,
                          { fontSize: Number(event.target.value) },
                          "Changed font size",
                        )
                      }
                      className="w-full"
                      aria-label="Font size slider"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span>Alignment</span>
                        <select
                          value={selectedObject.textAlign ?? "left"}
                          onChange={(event) =>
                            updateLayer(
                              selectedObject,
                              { textAlign: event.target.value },
                              "Changed text alignment",
                            )
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                        >
                          <option value="left">Left</option>
                          <option value="center">Centre</option>
                          <option value="right">Right</option>
                          <option value="justify">Justify</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span>Letter spacing</span>
                        <input
                          type="number"
                          value={selectedObject.charSpacing ?? 0}
                          onChange={(event) =>
                            updateLayer(
                              selectedObject,
                              { charSpacing: Number(event.target.value) },
                              "Changed letter spacing",
                            )
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateLayer(selectedObject, {
                            fontWeight:
                              selectedObject.fontWeight === "bold"
                                ? "normal"
                                : "bold",
                          })
                        }
                        className="rounded border border-slate-700 px-2 py-1"
                      >
                        Bold
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateLayer(selectedObject, {
                            fontStyle:
                              selectedObject.fontStyle === "italic"
                                ? "normal"
                                : "italic",
                          })
                        }
                        className="rounded border border-slate-700 px-2 py-1"
                      >
                        Italic
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      <label className="block">
                        <span>Text colour</span>
                        <div className="mt-1 flex gap-2">
                          <input
                            type="color"
                            value={
                              typeof selectedObject.fill === "string" &&
                              /^#[0-9a-f]{6}$/i.test(selectedObject.fill)
                                ? selectedObject.fill
                                : "#ffffff"
                            }
                            onChange={(event) =>
                              changeTextColour(
                                selectedObject,
                                event.target.value,
                              )
                            }
                            className="h-8 w-10 rounded"
                          />
                          <input
                            aria-label="Text colour hex"
                            value={
                              typeof selectedObject.fill === "string"
                                ? selectedObject.fill
                                : "#ffffff"
                            }
                            onChange={(event) =>
                              changeTextColour(
                                selectedObject,
                                event.target.value,
                              )
                            }
                            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1"
                          />
                        </div>
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {recentColors.map((colour) => (
                          <button
                            type="button"
                            key={colour}
                            title={`Use ${colour}`}
                            aria-label={`Use colour ${colour}`}
                            onClick={() =>
                              changeTextColour(selectedObject, colour)
                            }
                            className="h-7 w-7 rounded border border-slate-500"
                            style={{ backgroundColor: colour }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["X", selectedLeft, "left"],
                      ["Y", selectedTop, "top"],
                      ["Width", selectedWidth, "scaleX"],
                      ["Height", selectedHeight, "scaleY"],
                      ["Rotation", selectedObject.angle ?? 0, "angle"],
                    ] as const
                  ).map(([label, value, property]) => (
                    <label key={label} className="space-y-1">
                      <span>{label}</span>
                      <input
                        type="number"
                        value={Math.round(value * 100) / 100}
                        disabled={locked}
                        onChange={(event) =>
                          numericChange(property, Number(event.target.value))
                        }
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                      />
                    </label>
                  ))}
                </div>
                <label className="mt-3 block space-y-1">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedObject.opacity ?? 1}
                    disabled={locked}
                    onChange={(event) =>
                      updateSelected({ opacity: Number(event.target.value) })
                    }
                    className="w-full"
                  />
                </label>
                <div className="hidden">
                  <h3 className="font-semibold text-slate-100">Cut contour</h3>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={contour.enabled}
                      onChange={(event) =>
                        changeContour({ enabled: event.target.checked })
                      }
                    />{" "}
                    Enabled
                  </label>
                  <label className="mt-2 block space-y-1">
                    <span>Contour type</span>
                    <select
                      value={contour.type}
                      onChange={(event) =>
                        changeContour({
                          type: event.target.value as ContourSettings["type"],
                        })
                      }
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                    >
                      <option value="rectangle">Artwork rectangle</option>
                      <option value="silhouette">
                        Artwork silhouette contour
                      </option>
                      <option value="canvas">Full canvas contour</option>
                    </select>
                  </label>
                  <label className="mt-2 block space-y-1">
                    <span>Colour</span>
                    <select
                      value={contour.colour}
                      onChange={(event) =>
                        changeContour({ colour: event.target.value })
                      }
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                    >
                      <option value="#000000">Black</option>
                      <option value="#ffffff">White</option>
                      <option value="#ff00ff">Magenta</option>
                      <option value="#00aaff">
                        Custom colour (edit below)
                      </option>
                    </select>
                  </label>
                  <input
                    aria-label="Custom contour colour"
                    type="color"
                    value={contour.colour}
                    onChange={(event) =>
                      changeContour({ colour: event.target.value })
                    }
                    className="mt-2 h-8 w-full rounded"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span>Thickness (mm)</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={contour.thicknessMm}
                        onChange={(event) =>
                          changeContour({
                            thicknessMm: Math.max(
                              0.01,
                              Number(event.target.value),
                            ),
                          })
                        }
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                      />
                    </label>
                    <label className="space-y-1">
                      <span>Offset (mm)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={contour.offsetMm}
                        onChange={(event) =>
                          changeContour({
                            offsetMm: Math.max(0, Number(event.target.value)),
                          })
                        }
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                      />
                    </label>
                  </div>
                  {contour.type === "silhouette" ? (
                    <p className="mt-2 text-[10px] text-amber-400">
                      Silhouette preview currently falls back to the transformed
                      artwork bounds.
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => alignSelected("left")}
                    className="rounded border border-slate-700 px-2 py-1"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("right")}
                    className="rounded border border-slate-700 px-2 py-1"
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("top")}
                    className="rounded border border-slate-700 px-2 py-1"
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("bottom")}
                    className="rounded border border-slate-700 px-2 py-1"
                  >
                    Bottom
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("centerX")}
                    className="rounded border border-slate-700 px-2 py-1"
                  >
                    Centre H
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("centerY")}
                    className="rounded border border-slate-700 px-2 py-1"
                  >
                    Centre V
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-[11px]">
                  <p>
                    Resolution:{" "}
                    {naturalWidth ? `${naturalWidth} px` : "Unknown"}
                  </p>
                  <p>
                    Estimated print DPI:{" "}
                    {estimatedDpi ? Math.round(estimatedDpi) : "Unknown"}
                  </p>
                  <p>Lock: {locked ? "Locked" : "Unlocked"}</p>
                </div>
                <div className="mt-4 space-y-1 border-t border-slate-700 pt-3">
                  {bleed && !bleedCovered ? (
                    <p className="text-amber-400">⚠ Bleed not covered</p>
                  ) : null}
                  {outsideSafe ? (
                    <p className="text-amber-400">
                      ⚠ Artwork outside safe area
                    </p>
                  ) : null}
                  {lowResolution ? (
                    <p className="text-amber-400">⚠ Low image resolution</p>
                  ) : null}
                  {bleedCovered && !outsideSafe && !lowResolution ? (
                    <p className="text-emerald-400">✓ Ready to print</p>
                  ) : null}
                </div>
              </>
            )}
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setRightCollapsed(false)}
            className="hidden min-h-12 min-w-9 items-center justify-center rounded-l border border-slate-700 bg-slate-900 text-lg text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 lg:flex"
            aria-label="Expand right panel"
            title="Expand right panel"
          >
            ‹
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-400">
        <span>
          Selected: {selectedObject ? layerName(selectedObject) : "None"}
        </span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>
          Template: {Math.round((width / dpi) * 25.4)} ×{" "}
          {Math.round((height / dpi) * 25.4)} mm · {dpi} DPI
        </span>
        <span>
          {status === "dirty"
            ? "Unsaved"
            : status === "saving"
              ? "Saving"
              : status === "saved"
                ? "Saved"
                : status === "error"
                  ? "Failed"
                  : "Saved"}
        </span>
      </div>
    </div>
  );
}
