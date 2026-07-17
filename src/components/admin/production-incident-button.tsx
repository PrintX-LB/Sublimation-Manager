"use client";

import { useState } from "react";
import { recordProductionIncidentAction } from "@/app/(admin)/orders/actions";
import {
  OTHER_MATERIAL_WASTE_OPTIONS,
  PRODUCTION_INCIDENT_REASONS,
} from "@/lib/orders/production-incident-options";
import { inventoryQuantityLabel } from "@/lib/inventory/materials";

type ActionResult = { error?: string; success?: string };
type WasteOption = {
  inventoryItemId: string;
  name: string;
  quantity: string;
  unit: string;
  currentQuantity: string;
};

export function ProductionIncidentButton({
  orderItemId,
  productName,
  itemReference,
  disabledReason,
  wasteOptions = [],
}: {
  orderItemId: string;
  productName: string;
  itemReference?: string;
  disabledReason?: string;
  wasteOptions?: WasteOption[];
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [blankProductOutcome, setBlankProductOutcome] = useState("");
  const [otherMaterialWasted, setOtherMaterialWasted] = useState("None");
  const [selectedWaste, setSelectedWaste] = useState<Record<string, boolean>>(
    {},
  );

  function showDialog() {
    setResult(null);
    setIdempotencyKey(crypto.randomUUID());
    setBlankProductOutcome("");
    setOtherMaterialWasted("None");
    setSelectedWaste({});
    setOpen(true);
  }

  async function submit(formData: FormData) {
    setPending(true);
    const response = await recordProductionIncidentAction(formData);
    setResult(response);
    setPending(false);
    if (response.success) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={showDialog}
        disabled={Boolean(disabledReason)}
        title={disabledReason}
        className="rounded border border-rose-500/60 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
      >
        Record Incident & Reprint
      </button>
      {disabledReason ? (
        <span className="text-[11px] text-amber-300">{disabledReason}</span>
      ) : null}
      {result?.success ? (
        <p className="mt-1 text-[11px] text-emerald-300">{result.success}</p>
      ) : null}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="presentation"
        >
          <form
            action={submit}
            className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Record Incident &amp; Reprint
              </h2>
              {itemReference ? <p className="text-xs font-semibold text-brand-200">{itemReference}</p> : null}
              <p className="mt-1 text-xs text-slate-400">
                A replacement print attempt for <strong>{productName}</strong>{" "}
                will be created. Select whether the physical blank product was
                also damaged.
              </p>
            </div>
            <input type="hidden" name="orderItemId" value={orderItemId} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input
              type="hidden"
              name="wastedMaterials"
              value={JSON.stringify(
                wasteOptions
                  .filter((option) => selectedWaste[option.inventoryItemId])
                  .map((option) => ({
                    inventoryItemId: option.inventoryItemId,
                    quantity: option.quantity,
                  })),
              )}
            />
            <label className="block text-xs text-slate-300">
              Incident reason <span className="text-rose-300">*</span>
              <select
                name="reason"
                required
                className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              >
                <option value="">Select a reason</option>
                {PRODUCTION_INCIDENT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-2 rounded border border-slate-800 bg-slate-950/50 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-300">
                Blank product outcome <span className="text-rose-300">*</span>
              </legend>
              <label className="flex items-start gap-2 text-xs text-slate-300">
                <input
                  type="radio"
                  name="blankProductOutcome"
                  value="damaged"
                  required
                  checked={blankProductOutcome === "damaged"}
                  onChange={() => setBlankProductOutcome("damaged")}
                />
                <span>Blank product was damaged or discarded</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-300">
                <input
                  type="radio"
                  name="blankProductOutcome"
                  value="usable"
                  required
                  checked={blankProductOutcome === "usable"}
                  onChange={() => setBlankProductOutcome("usable")}
                />
                <span>Blank product is still usable</span>
              </label>
            </fieldset>
            <label className="block text-xs text-slate-300">
              Other material wasted
              <select
                name="otherMaterialWasted"
                value={otherMaterialWasted}
                onChange={(event) => setOtherMaterialWasted(event.target.value)}
                className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              >
                {OTHER_MATERIAL_WASTE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {wasteOptions.length ? (
              <fieldset className="space-y-2 rounded border border-slate-800 bg-slate-950/50 p-3">
                <legend className="px-1 text-xs font-semibold text-slate-300">
                  Select additional materials wasted
                </legend>
                {wasteOptions.map((option) => (
                  <label
                    key={option.inventoryItemId}
                    className="flex items-center justify-between gap-2 text-xs text-slate-300"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedWaste[option.inventoryItemId])}
                        onChange={(event) =>
                          setSelectedWaste((current) => ({
                            ...current,
                            [option.inventoryItemId]: event.target.checked,
                          }))
                        }
                      />
                      {option.name} — {option.quantity}{" "}
                      {inventoryQuantityLabel(option.quantity)}
                    </span>
                    <span className="text-slate-500">
                      Available: {option.currentQuantity}{" "}
                      {inventoryQuantityLabel(option.currentQuantity)}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="block text-xs text-slate-300">
              Note (optional)
              <textarea
                name="note"
                rows={3}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <div className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
              <p className="font-semibold text-slate-200">
                Confirmation summary
              </p>
              <dl className="mt-2 space-y-1">
                <div className="flex justify-between">
                  <dt>Replacement print</dt>
                  <dd>Yes</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Blank product deduction</dt>
                  <dd>
                    {blankProductOutcome === "damaged"
                      ? "Yes"
                      : blankProductOutcome === "usable"
                        ? "No"
                        : "Select above"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Additional blank cost</dt>
                  <dd>
                    {blankProductOutcome === "damaged"
                      ? "Calculated from product cost"
                      : blankProductOutcome === "usable"
                        ? "$0.00"
                        : "Select above"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Customer quantity</dt>
                  <dd>Unchanged</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Customer price</dt>
                  <dd>Unchanged</dd>
                </div>
              </dl>
            </div>
            {result?.error ? (
              <p
                role="alert"
                className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200"
              >
                {result.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Recording…" : "Confirm reprint"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
