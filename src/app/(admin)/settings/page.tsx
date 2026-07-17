import { PageHeading } from "@/components/admin/page-heading";
import { CleanupButton } from "@/components/admin/cleanup-button";
import { getAdminSession } from "@/lib/admin-session";
import { getAdminCredentialStatus } from "@/lib/admin-credentials";
import { getOrderStorageSettings } from "@/lib/order-storage";
import { getBackupData } from "@/lib/backup-restore";
import { StorageForm } from "./storage-form";
import { BackupForm } from "./backup-form";
import {
  adminLoginAction,
  adminLogoutAction,
  initializeAdminAction,
  runStorageCleanupAction,
} from "./actions";
import { ResetDevelopmentForm } from "./reset-development-form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    admin?: string;
    adminSetup?: string;
    storage?: string;
    checked?: string;
    eligible?: string;
    folders?: string;
    files?: string;
    skipped?: string;
    errors?: string;
    reason?: string;
    testResult?: "success" | "failed" | "invalid";
    type?: string;
    error?: string;
    openResult?: string;
    backup?: string;
    backupSettings?: string;
    restore?: string;
  }>;
}) {
  const unlocked = await getAdminSession();
  const adminCredentials = await getAdminCredentialStatus();
  const params = await searchParams;
  const storage = await getOrderStorageSettings();
  const { settings: backupSettings, history: backupHistory } = await getBackupData();

  return (
    <>
      <PageHeading title="Settings" description="Local PrintX workspace settings." />
      
      {/* Toast Alert Feedback */}
      {(params.backup === "created" ||
        params.backup === "pinned" ||
        params.backup === "deleted" ||
        params.backupSettings === "saved" ||
        params.restore === "success") && (
        <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          ✓ Action completed successfully:{" "}
          {params.backup === "created" && "Backup archive created."}
          {params.backup === "pinned" && "Backup pin state toggled."}
          {params.backup === "deleted" && "Backup archive removed."}
          {params.backupSettings === "saved" && "Backup scheduler configurations updated."}
          {params.restore === "success" && "Database and storage files successfully restored."}
        </div>
      )}

      {params.restore && params.restore !== "success" && (
        <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          ⚠ Restore failed: {params.error ? decodeURIComponent(params.error) : "An error occurred during restore."}
        </div>
      )}

      {params.backup === "failed" && (
        <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          ⚠ Backup creation failed: {params.error ? decodeURIComponent(params.error) : "Unknown error."}
        </div>
      )}
      
      <div className="grid gap-6 lg:grid-cols-2 mt-8">
        
        {/* Admin Mode Panel */}
        <section className="rounded-xl border border-slate-800 bg-[#1e293b]/40 p-6 shadow-sm self-start text-slate-100">
          <h2 className="font-semibold text-slate-200 text-lg border-b border-slate-800 pb-3">Admin Mode</h2>
          {unlocked ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-emerald-400 font-medium">
                ✓ Admin Mode unlocked · expires after 30 minutes of inactivity.
              </p>
              <form action={adminLogoutAction}>
                <button className="rounded-lg border border-slate-800 bg-[#0f172a] text-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-800 transition">
                  Lock Admin Mode
                </button>
              </form>
              {process.env.NODE_ENV === "development" ? (
                <ResetDevelopmentForm />
              ) : null}
            </div>
          ) : adminCredentials.configurationError ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
              Admin credentials are only partially configured. Repair the Admin credential configuration before continuing.
            </div>
          ) : !adminCredentials.configured ? (
            <form action={initializeAdminAction} className="mt-4 space-y-4" autoComplete="off">
              <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 text-sm text-sky-100">
                <p className="font-semibold">Create the PrintX administrator</p>
                <p className="mt-1 text-xs text-sky-200/80">
                  This is a one-time setup for this fresh installation. The password is stored only as a secure hash.
                </p>
              </div>
              <label className="block text-sm font-medium text-slate-300">
                Admin username
                <input name="username" required minLength={3} maxLength={64} autoComplete="username" className="mt-1 w-full rounded-lg border border-slate-800 bg-[#0f172a] p-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500" />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Password
                <input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-800 bg-[#0f172a] p-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500" />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Confirm password
                <input name="confirmPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-800 bg-[#0f172a] p-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500" />
              </label>
              {params.adminSetup && (
                <p className="text-sm font-semibold text-red-400">
                  {params.adminSetup === "password_mismatch" && "Passwords do not match."}
                  {params.adminSetup === "weak_password" && "Use a password between 10 and 128 characters."}
                  {params.adminSetup === "invalid_username" && "Use a username between 3 and 64 characters."}
                  {params.adminSetup === "already_configured" && "Admin Mode has already been configured. Refresh and sign in."}
                  {params.adminSetup === "configuration_error" && "Admin configuration is incomplete and could not be initialized."}
                </p>
              )}
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition">
                Create Administrator
              </button>
            </form>
          ) : (
            <form action={adminLoginAction} className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-slate-300">
                Username
                <input name="username" required className="mt-1 w-full rounded-lg border border-slate-800 bg-[#0f172a] p-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500" />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Password
                <input name="password" type="password" required className="mt-1 w-full rounded-lg border border-slate-800 bg-[#0f172a] p-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500" />
              </label>
              {params.admin === "invalid" && <p className="text-sm text-red-400 font-semibold">Invalid admin credentials.</p>}
              {params.admin === "required" && (
                <p className="text-sm text-amber-400 font-semibold">
                  Admin Mode is locked. Please log in first.
                </p>
              )}
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition">
                Unlock Admin Mode
              </button>
            </form>
          )}
        </section>

        {/* Storage Configuration Panel */}
        <section className="rounded-xl border border-slate-800 bg-[#1e293b]/40 p-6 shadow-sm text-slate-100">
          <h2 className="font-semibold text-slate-200 text-lg border-b border-slate-800 pb-3">Storage</h2>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            Order files and print sheets are stored locally. New files will be saved to this location. Existing files will remain in their current folders.
          </p>

          {/* Cleanup Reports */}
          {params.storage === "cleaned" && (
            <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200" role="status">
              <p className="font-semibold text-emerald-300">Cleanup completed successfully</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <li>Orders checked: {params.checked ?? "0"}</li>
                <li>Eligible: {params.eligible ?? "0"}</li>
                <li>Folders deleted: {params.folders ?? "0"}</li>
                <li>Files deleted: {params.files ?? "0"}</li>
              </ul>
              {params.reason && <p className="mt-3 text-xs text-amber-400 font-mono">Skipped: {params.reason}</p>}
            </div>
          )}

          <div className="mt-4">
            <StorageForm
              initialBaseFolder={storage.baseFolder}
              initialPrintSheetFolder={storage.printSheetFolder}
              initialRetentionDays={storage.retentionDays}
              unlocked={Boolean(unlocked)}
              testResult={params.testResult}
              testType={params.type}
              testError={params.error}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Manual Maintenance</span>
            <CleanupButton action={runStorageCleanupAction} />
          </div>
          <p className="mt-2.5 text-[10px] text-slate-500 text-right">
            Last cleanup: {storage.lastCleanupAt ? new Date(storage.lastCleanupAt).toLocaleString() : "Not run yet"}
          </p>
        </section>

      </div>

      <BackupForm
        settings={backupSettings}
        history={backupHistory}
        unlocked={Boolean(unlocked)}
        activeStorageFolder={storage.baseFolder}
        activeSheetsFolder={storage.printSheetFolder}
      />
    </>
  );
}
