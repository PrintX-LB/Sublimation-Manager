"use client";

import React, { useState } from "react";
import {
  Database,
  Calendar,
  Save,
  Play,
  RotateCcw,
  Pin,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileArchive,
  RefreshCw,
} from "lucide-react";
import {
  saveBackupSettingsAction,
  createManualBackupAction,
  togglePinBackupAction,
  deleteBackupAction,
  restoreFromHistoryAction,
  restoreFromPathAction,
} from "./actions";
import { BackupSettings, BackupHistoryEntry } from "@/lib/backup-restore";

interface BackupFormProps {
  settings: BackupSettings;
  history: BackupHistoryEntry[];
  unlocked: boolean;
  activeStorageFolder: string;
  activeSheetsFolder: string;
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));

export function BackupForm({
  settings,
  history,
  unlocked,
  activeStorageFolder,
  activeSheetsFolder,
}: BackupFormProps) {
  const [schedule, setSchedule] = useState(settings.schedule);
  const [keepMinCount, setKeepMinCount] = useState(settings.keepMinCount);
  const [archivePath, setArchivePath] = useState("");
  const [remapOrders, setRemapOrders] = useState("");
  const [remapSheets, setRemapSheets] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleAction = async (name: string, fn: () => Promise<void>) => {
    setLoadingAction(name);
    try {
      await fn();
    } finally {
      setLoadingAction(null);
    }
  };

  const restartAfterRestore = async () => {
    setRestoreMessage({ type: "success", text: "Restore completed. Restarting PrintX with the restored database…" });
    const desktop = (window as Window & { printxDesktop?: { restart: () => Promise<unknown> } }).printxDesktop;
    if (desktop) {
      await desktop.restart();
      return;
    }
    window.location.assign("/settings?restore=success");
  };

  const runRestore = async (name: string, action: () => Promise<{ success: boolean; error?: string }>) => {
    setLoadingAction(name);
    setRestoreMessage(null);
    try {
      const result = await action();
      if (!result.success) {
        setRestoreMessage({ type: "error", text: result.error || "Restore failed." });
        return;
      }
      await restartAfterRestore();
    } catch (error) {
      setRestoreMessage({ type: "error", text: error instanceof Error ? error.message : "Restore failed." });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6 mt-8">
      <div className="border-t border-slate-800 pt-6">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Database className="h-5 w-5 text-brand-500" /> Backup & Restore
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure automated database consistency backups, manage archive snapshots, and perform staged restores with rollbacks.
        </p>
      </div>

      {restoreMessage && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${restoreMessage.type === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`} role="status">
          {restoreMessage.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Backup Settings Panel */}
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#1e293b]/40 p-5 shadow-sm">
          <h3 className="font-bold text-slate-200 text-sm border-b border-slate-800 pb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-500" /> Automated Schedule & Retention
          </h3>

          <form action={saveBackupSettingsAction} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Backup Schedule Frequency
              </label>
              <select
                name="schedule"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as "disabled" | "daily" | "weekly" | "monthly")}
                className="w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200 focus:outline-none"
              >
                <option value="disabled">Disabled (Manual Only)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Minimum Backups to Keep (Retention)
              </label>
              <input
                name="keepMinCount"
                type="number"
                min="1"
                max="50"
                value={keepMinCount}
                onChange={(e) => setKeepMinCount(parseInt(e.target.value) || 5)}
                className="w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-sm text-slate-200 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Automated cleanup keeps this many successful backups. Pinned backups are always preserved.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-3">
              <div>
                <span>Last run: </span>
                <span className="font-mono text-slate-300">
                  {settings.lastBackupAt
                    ? formatDateTime(settings.lastBackupAt)
                    : "Never"}
                </span>
              </div>
              {settings.nextScheduledAt && (
                <div>
                  <span>Next scheduled: </span>
                  <span className="font-mono text-emerald-400">
                    {formatDateTime(settings.nextScheduledAt)}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!unlocked || loadingAction === "save-settings"}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> Save Configuration
            </button>
          </form>

          <div className="border-t border-slate-800 pt-4 flex gap-2">
            <button
              onClick={() => handleAction("manual-backup", async () => {
                await createManualBackupAction();
              })}
              disabled={!unlocked || loadingAction !== null}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
            >
              {loadingAction === "manual-backup" ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Create Backup Snapshot
            </button>
          </div>
        </div>

        {/* Restore from Path Panel */}
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#1e293b]/40 p-5 shadow-sm self-start">
          <h3 className="font-bold text-slate-200 text-sm border-b border-slate-800 pb-2 flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-brand-500" /> Restore from Archive Path
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Specify a path to a valid ZIP backup on this device. Restoring will replace the database and storage files.
          </p>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirm("Are you sure you want to perform a restore? Current data will be replaced. An emergency backup will be created first.")) return;
              const formData = new FormData(event.currentTarget);
              void runRestore("restore-path", () => restoreFromPathAction(formData));
            }}
          >
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Local Zip Path
              </label>
              <input
                name="archivePath"
                value={archivePath}
                onChange={(e) => setArchivePath(e.target.value)}
                placeholder="e.g. C:\Users\name\data\backups\backup_xxx.zip"
                className="w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Remap Orders Base Path
                </label>
                <input
                  name="remapOrdersFolder"
                  value={remapOrders}
                  onChange={(e) => setRemapOrders(e.target.value)}
                  placeholder={`Default: ${activeStorageFolder.substring(0, 15)}...`}
                  className="w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Remap Sheets Path
                </label>
                <input
                  name="remapSheetsFolder"
                  value={remapSheets}
                  onChange={(e) => setRemapSheets(e.target.value)}
                  placeholder={`Default: ${activeSheetsFolder.substring(0, 15)}...`}
                  className="w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!unlocked || !archivePath || loadingAction !== null}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" /> Restore Backup File
            </button>
          </form>
        </div>
      </div>

      {/* Backup History Log Table */}
      <div className="rounded-xl border border-slate-800 bg-[#1e293b]/40 p-5 shadow-sm">
        <h3 className="font-bold text-slate-200 text-sm border-b border-slate-800 pb-2 mb-4">
          Backup History Log ({history.length})
        </h3>

        {history.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500">
            No backup snapshots have been created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Date / Time</th>
                  <th className="py-2.5 px-3">Filename</th>
                  <th className="py-2.5 px-3 text-right">Size</th>
                  <th className="py-2.5 px-3 text-center">Files</th>
                  <th className="py-2.5 px-3 text-center">Type</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((backup) => (
                  <tr key={backup.id} className="hover:bg-slate-800/20 text-slate-300">
                    <td className="py-3 px-3 font-medium whitespace-nowrap">
                      {formatDateTime(backup.timestamp)}
                    </td>
                    <td className="py-3 px-3 font-mono break-all max-w-[200px]" title={backup.filePath}>
                      {backup.filename}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {backup.status === "success"
                        ? `${(backup.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                        : "-"}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">{backup.fileCount}</td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          backup.type === "manual" ? "bg-purple-500/10 text-purple-400" : "bg-sky-500/10 text-sky-400"
                        }`}
                      >
                        {backup.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {backup.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 size={13} /> Success
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-red-400 font-semibold cursor-pointer"
                          title={backup.errorMessage}
                        >
                          <AlertCircle size={13} /> Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleAction(`pin-${backup.id}`, async () => {
                            await togglePinBackupAction(backup.id);
                          })}
                          disabled={!unlocked || backup.status !== "success" || loadingAction !== null}
                          className={`p-1.5 rounded border transition ${
                            backup.isPinned
                              ? "bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30"
                              : "border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                          title={backup.isPinned ? "Unpin (allows auto-deletion)" : "Pin backup (prevents auto-deletion)"}
                        >
                          <Pin size={13} className={backup.isPinned ? "fill-current" : ""} />
                        </button>

                        <button
                          onClick={() => {
                            if (confirm("Restore this backup snapshot? Current files and database will be replaced. A safety backup will be created.")) {
                              void runRestore(`restore-${backup.id}`, () => restoreFromHistoryAction(backup.id, remapOrders || undefined, remapSheets || undefined));
                            }
                          }}
                          disabled={!unlocked || backup.status !== "success" || loadingAction !== null}
                          className="p-1.5 rounded border border-slate-800 hover:bg-emerald-500/15 hover:border-emerald-500/30 text-slate-400 hover:text-emerald-400 transition"
                          title="Restore this backup"
                        >
                          {loadingAction === `restore-${backup.id}` ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw size={13} />
                          )}
                        </button>

                        <button
                          onClick={() => {
                            if (confirm("Delete this backup snapshot file permanently?")) {
                              handleAction(`delete-${backup.id}`, async () => {
                                await deleteBackupAction(backup.id);
                              });
                            }
                          }}
                          disabled={!unlocked || loadingAction !== null}
                          className="p-1.5 rounded border border-slate-800 hover:bg-red-500/15 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition"
                          title="Delete snapshot"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
