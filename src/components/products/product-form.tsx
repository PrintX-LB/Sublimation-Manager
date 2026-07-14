"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { initialFormState, type FormState } from "@/lib/forms/state";
import { CategoryPicker } from "./category-picker";

type VariantDraft = {
  id: string;
  name: string;
  optionName: string | null;
  optionValue: string | null;
  stockQuantity: string;
  reorderLevel: string;
  sellingPrice: string;
  productionCost: string;
  stockPerUnit: string;
};
const blankVariant = (): VariantDraft => ({
  id: "",
  name: "Standard",
  optionName: null,
  optionValue: null,
  sellingPrice: "0.00",
  productionCost: "0.00",
  stockQuantity: "0",
  reorderLevel: "0",
  stockPerUnit: "1",
});

export function ProductForm({
  action,
  categories,
  templates,
  product,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  categories: Array<{ id: string; name: string }>;
  templates: Array<{ id: string; name: string }>;
  product?: {
    name: string;
    description: string | null;
    categoryId: string | null;
    printTemplateId: string | null;
    variants: VariantDraft[];
  };
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants ?? [blankVariant()],
  );
  const update = (index: number, field: keyof VariantDraft, value: string) =>
    setVariants((current) =>
      current.map((variant, itemIndex) =>
        itemIndex === index ? { ...variant, [field]: value } : variant,
      ),
    );
  return (
    <form action={formAction} className="mt-8 space-y-6">
      <section className="grid gap-5 rounded-2xl border bg-white p-6 shadow-panel sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="text-sm font-medium">
            Product name *
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={product?.name}
            className="mt-2 w-full rounded-xl border px-4 py-3 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={product?.description ?? ""}
            className="mt-2 w-full rounded-xl border px-4 py-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="categoryId" className="text-sm font-medium">
            Category *
          </label>
          <CategoryPicker
            categories={categories}
            defaultValue={product?.categoryId ?? ""}
            name="categoryId"
          />
        </div>
        <div>
          <label htmlFor="printTemplateId" className="text-sm font-medium">
            Print template
          </label>
          <select
            id="printTemplateId"
            name="printTemplateId"
            defaultValue={product?.printTemplateId ?? ""}
            className="mt-2 w-full rounded-xl border px-4 py-3 text-sm"
          >
            <option value="">None</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="rounded-2xl border bg-white p-6 shadow-panel">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Product variants</h2>
            <p className="mt-1 text-sm text-slate-500">
              Keep one “Standard” row for products without colour or size
              options.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setVariants((current) => [...current, blankVariant()])
            }
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            <Plus size={16} />
            Add variant
          </button>
        </div>
        <input type="hidden" name="variants" value={JSON.stringify(variants)} />
        <div className="mt-5 space-y-4">
          {variants.map((variant, index) => (
            <fieldset
              key={`${variant.id}-${index}`}
              className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              <legend className="sr-only">Variant {index + 1}</legend>
              {[
                ["name", "Name"],
                ["optionName", "Option type (e.g. Size)"],
                ["optionValue", "Option value (e.g. Large)"],
                ["sellingPrice", "Selling price"],
                ["productionCost", "Production cost"],
                ["stockQuantity", "Current stock"],
                ["reorderLevel", "Low-stock threshold"],
                ["stockPerUnit", "Stock consumed per sold unit"],
              ].map(([field, label]) => {
                if (!field || !label) return null;
                return (
                  <label
                    key={field}
                    className="text-xs font-medium text-slate-600"
                  >
                    {label}
                    <input
                      required={[
                        "name",
                        "sellingPrice",
                        "productionCost",
                        "stockQuantity",
                        "reorderLevel",
                        "stockPerUnit",
                      ].includes(field)}
                      type={
                        ["stockQuantity", "reorderLevel"].includes(field)
                          ? "number"
                          : "text"
                      }
                      min={
                        ["stockQuantity", "reorderLevel"].includes(field)
                          ? 0
                          : undefined
                      }
                      value={String(variant[field as keyof VariantDraft] ?? "")}
                      onChange={(event) =>
                        update(
                          index,
                          field as keyof VariantDraft,
                          event.target.value,
                        )
                      }
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </label>
                );
              })}
              <button
                type="button"
                disabled={variants.length === 1}
                onClick={() =>
                  setVariants((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                className="inline-flex items-center gap-1 self-end text-sm font-medium text-red-600 disabled:opacity-30"
              >
                <Trash2 size={15} />
                Remove
              </button>
            </fieldset>
          ))}
        </div>
      </section>
      {state.message ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.message}
        </p>
      ) : null}
      <button
        disabled={pending || categories.length === 0}
        className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save product"}
      </button>
      {categories.length === 0 ? (
        <p className="text-sm text-amber-700">
          Create a product category before adding products.
        </p>
      ) : null}
    </form>
  );
}
