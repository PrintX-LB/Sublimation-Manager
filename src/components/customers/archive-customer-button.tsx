"use client";
import { Trash2 } from "lucide-react";
export function ArchiveCustomerButton({
  action,
  id,
  name,
}: {
  action: (data: FormData) => void;
  id: string;
  name: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Archive ${name}? This will deactivate the customer and cannot be undone.`,
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Delete ${name}`}
        title="Delete customer"
        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
      >
        <Trash2 size={17} />
      </button>
    </form>
  );
}
