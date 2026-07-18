"use client";

import { Trash2 } from "lucide-react";

export function DeleteTemplateButton({ templateId, templateName, action }: { templateId: string; templateName: string; action: (formData: FormData) => void }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete template "${templateName}"? Products and artwork will be kept, but their template link will be cleared.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={templateId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
        aria-label={`Delete ${templateName}`}
      >
        <Trash2 className="h-4 w-4" /> Delete
      </button>
    </form>
  );
}
