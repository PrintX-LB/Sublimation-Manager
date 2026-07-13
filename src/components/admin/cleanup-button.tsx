"use client";

export function CleanupButton({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("This will permanently delete order artwork files older than the retention period. This cannot be undone. Continue?")) event.preventDefault();
    }}>
      <input type="hidden" name="force" value="true" />
      <button className="rounded-lg border px-3 py-2 text-sm font-semibold">Run Cleanup Now</button>
    </form>
  );
}
