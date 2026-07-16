"use client";

import React, { useState } from "react";
import { Folder, ArrowUp, ChevronRight, X, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { saveStorageSettingsAction, testStorageFolderAction, openConfiguredFolderAction } from "./actions";

interface StorageFormProps {
  initialBaseFolder: string;
  initialPrintSheetFolder: string;
  initialRetentionDays: number;
  unlocked: boolean;
  testResult?: "success" | "failed" | "invalid";
  testType?: string;
  testError?: string;
}

export function StorageForm({
  initialBaseFolder,
  initialPrintSheetFolder,
  initialRetentionDays,
  unlocked,
  testResult,
  testType,
  testError,
}: StorageFormProps) {
  // Config state
  const [baseFolder, setBaseFolder] = useState(initialBaseFolder);
  const [printSheetFolder, setPrintSheetFolder] = useState(initialPrintSheetFolder);
  const [retentionDays, setRetentionDays] = useState(initialRetentionDays);

  // Folder browser dialog state
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<"orders" | "sheets" | null>(null);
  const [browserCurrentPath, setBrowserCurrentPath] = useState("");
  const [browserParentPath, setBrowserParentPath] = useState<string | null>(null);
  const [browserSubdirs, setBrowserSubdirs] = useState<string[]>([]);
  const [browserDrives, setBrowserDrives] = useState<string[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Load directory list via API
  const loadDirectory = async (targetPath: string) => {
    try {
      setLoadingDirectory(true);
      const res = await fetch(`/api/browse-directory?path=${encodeURIComponent(targetPath)}`);
      if (res.ok) {
        const data = await res.json();
        setBrowserCurrentPath(data.currentPath);
        setBrowserParentPath(data.parentPath);
        setBrowserSubdirs(data.subdirs || []);
        setBrowserDrives(data.drives || []);
      }
    } catch (err) {
      console.error("Browse directory API error", err);
    } finally {
      setLoadingDirectory(false);
    }
  };

  const openFolderPicker = (target: "orders" | "sheets") => {
    setActiveTarget(target);
    const startPath = target === "orders" ? baseFolder : printSheetFolder;
    setBrowserCurrentPath(startPath);
    setIsBrowserOpen(true);
    loadDirectory(startPath);
  };

  const handleSelectFolder = () => {
    if (activeTarget === "orders") {
      setBaseFolder(browserCurrentPath);
    } else if (activeTarget === "sheets") {
      setPrintSheetFolder(browserCurrentPath);
    }
    setIsBrowserOpen(false);
    setActiveTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Test / Open Feedback Alerts */}
      {testResult && (
        <div
          className={`flex gap-3 rounded-lg border p-4 text-sm ${
            testResult === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/20 bg-red-500/10 text-red-200"
          }`}
        >
          {testResult === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          )}
          <div>
            <p className="font-bold">
              {testType === "sheets" ? "Print Sheet Builder Folder" : "Order Files Folder"} Test: {testResult.toUpperCase()}
            </p>
            {testResult === "success" ? (
              <p className="text-xs text-emerald-400/80 mt-1">Read/write access verified successfully.</p>
            ) : (
              <p className="text-xs text-red-400/80 mt-1">{testError || "Folder path is invalid or unwritable."}</p>
            )}
          </div>
        </div>
      )}

      {/* Main Settings Form */}
      <form action={saveStorageSettingsAction} className="space-y-6">
        
        {/* ORDER FILES BASE FOLDER SECTION */}
        <div className="space-y-3 rounded-xl border border-slate-800 bg-[#1e293b]/40 p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Order Files Base Folder</h3>
              <p className="text-xs text-slate-400 mt-0.5">Used for original artwork, attachments, and per-order exports.</p>
            </div>
            <span className="text-[10px] rounded bg-slate-800 text-slate-400 px-2 py-0.5 uppercase tracking-wider font-mono">
              Base Path
            </span>
          </div>

          <div className="flex gap-2">
            <input
              name="baseFolder"
              value={baseFolder}
              onChange={(e) => setBaseFolder(e.target.value)}
              placeholder="e.g. C:\uploads"
              className="flex-1 rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => openFolderPicker("orders")}
              disabled={!unlocked}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 border border-slate-700 transition disabled:opacity-40"
            >
              Browse
            </button>
          </div>

          {/* Actions Subbar */}
          <div className="flex flex-wrap gap-2 pt-1.5">
            <button
              formAction={testStorageFolderAction}
              className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition"
            >
              Test Folder
            </button>
            <button
              formAction={openConfiguredFolderAction}
              className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition"
            >
              Open Folder
            </button>
            <button
              type="button"
              onClick={() => setBaseFolder("uploads")}
              className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition"
            >
              Reset
            </button>
            <input type="hidden" name="folderType" value="orders" />
          </div>
        </div>

        {/* PRINT SHEET BUILDER FOLDER SECTION */}
        <div className="space-y-3 rounded-xl border border-slate-800 bg-[#1e293b]/40 p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Print Sheet Builder Folder</h3>
              <p className="text-xs text-slate-400 mt-0.5">Used only for generated A4 print sheets, mixed-order print sheets, and sheet previews.</p>
            </div>
            <span className="text-[10px] rounded bg-slate-800 text-slate-400 px-2 py-0.5 uppercase tracking-wider font-mono">
              Print Sheets Path
            </span>
          </div>

          <div className="flex gap-2">
            <input
              name="printSheetFolder"
              value={printSheetFolder}
              onChange={(e) => setPrintSheetFolder(e.target.value)}
              placeholder="e.g. C:\print-sheets"
              className="flex-1 rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => openFolderPicker("sheets")}
              disabled={!unlocked}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 border border-slate-700 transition disabled:opacity-40"
            >
              Browse
            </button>
          </div>

          {/* Actions Subbar */}
          <div className="flex flex-wrap gap-2 pt-1.5">
            <button
              formAction={testStorageFolderAction}
              onClick={(e) => {
                // Ensure we submit folderType as sheets
                const form = e.currentTarget.form;
                if (form) {
                  const input = form.querySelector('input[name="folderType"]') as HTMLInputElement;
                  if (input) input.value = "sheets";
                }
              }}
              className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition"
            >
              Test Folder
            </button>
            <button
              formAction={openConfiguredFolderAction}
              onClick={(e) => {
                const form = e.currentTarget.form;
                if (form) {
                  const input = form.querySelector('input[name="folderType"]') as HTMLInputElement;
                  if (input) input.value = "sheets";
                }
              }}
              className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition"
            >
              Open Folder
            </button>
            <button
              type="button"
              onClick={() => setPrintSheetFolder("print-sheets")}
              className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition"
            >
              Reset
            </button>
          </div>
        </div>

        {/* RETENTION SETTING */}
        <div className="space-y-2 rounded-xl border border-slate-800 bg-[#1e293b]/40 p-4">
          <label className="block text-sm font-bold text-slate-200">Delete order files after (days)</label>
          <input
            name="retentionDays"
            type="number"
            min="1"
            value={retentionDays}
            onChange={(e) => setRetentionDays(parseInt(e.target.value) || 15)}
            className="w-40 rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200 focus:outline-none"
          />
        </div>

        {/* SUBMIT */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!unlocked}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition disabled:opacity-40"
          >
            Save Storage Settings
          </button>
        </div>
      </form>

      {/* Directory Browser Modal */}
      {isBrowserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
            
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h4 className="font-bold text-slate-200 flex items-center gap-2">
                <Folder className="h-4 w-4 text-amber-500" /> Select Folder
              </h4>
              <button
                type="button"
                onClick={() => setIsBrowserOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={18} />
              </button>
            </div>

            {/* Current Path Bar */}
            <div className="bg-[#0f172a] rounded-lg border border-slate-800 p-2 text-xs font-mono text-emerald-400 break-all">
              {browserCurrentPath || "Root"}
            </div>

            {/* Directory Explorer Pane */}
            <div className="h-60 overflow-y-auto border border-slate-800 bg-[#0f172a]/50 rounded-xl p-2 space-y-1">
              
              {/* Back Button */}
              {browserParentPath && (
                <button
                  type="button"
                  onClick={() => loadDirectory(browserParentPath)}
                  className="w-full text-left flex items-center gap-2.5 px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded transition"
                >
                  <ArrowUp size={14} className="text-slate-500" /> [Parent Directory]
                </button>
              )}

              {/* Logical windows drives */}
              {browserDrives.length > 0 && (
                <div className="flex gap-1.5 px-2 py-1 text-[10px] text-slate-500 font-bold border-b border-slate-800/60 mb-1.5">
                  Drives:
                  {browserDrives.map((drive) => (
                    <button
                      key={drive}
                      type="button"
                      onClick={() => loadDirectory(drive)}
                      className="hover:text-slate-200 underline font-mono ml-1"
                    >
                      {drive}
                    </button>
                  ))}
                </div>
              )}

              {/* Subdirectories list */}
              {loadingDirectory ? (
                <div className="text-center py-10 text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading directories...
                </div>
              ) : browserSubdirs.length > 0 ? (
                browserSubdirs.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => loadDirectory(browserCurrentPath === "C:\\" || browserCurrentPath === "D:\\" || browserCurrentPath === "E:\\" || browserCurrentPath === "F:\\" ? `${browserCurrentPath}${dir}` : `${browserCurrentPath}/${dir}`)}
                    className="w-full text-left flex items-center justify-between px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 rounded transition"
                  >
                    <span className="flex items-center gap-2">
                      <Folder className="h-3.5 w-3.5 text-slate-500" /> {dir}
                    </span>
                    <ChevronRight size={12} className="text-slate-600" />
                  </button>
                ))
              ) : (
                <div className="text-center py-10 text-xs text-slate-500">
                  Empty folder or no subdirectories found.
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsBrowserOpen(false)}
                className="rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSelectFolder}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white"
              >
                Select Folder
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
