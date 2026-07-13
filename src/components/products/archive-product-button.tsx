"use client";
import { useState } from "react";
export function ArchiveProductButton({
  action,
  id,
}: {
  action: (data: FormData) => void;
  id: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !confirmed &&
          !window.confirm("Are you sure you want to archive this product?")
        )
          event.preventDefault();
        setConfirmed(true);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">
        Archive
      </button>
    </form>
  );
}
