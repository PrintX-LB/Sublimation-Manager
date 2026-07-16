import { AdminShell } from "@/components/admin/admin-shell";
import { checkAndRunScheduledBackup } from "@/lib/backup-restore";

let lastChecked = 0;
const FIVE_MINUTES = 5 * 60 * 1000;

async function runScheduledCheck() {
  const now = Date.now();
  if (now - lastChecked < FIVE_MINUTES) return;
  lastChecked = now;
  try {
    await checkAndRunScheduledBackup();
  } catch (err) {
    console.error("Failed scheduled backup in background check", err);
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  runScheduledCheck();

  return <AdminShell>{children}</AdminShell>;
}

