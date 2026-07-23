"use client";

import { useMemo, useState } from "react";
import type { PairingAttempt } from "@/lib/production/sheet-pairing";
import { orderItemReference } from "@/lib/orders/item-reference";

export function PairDraftEditor({
  slots: initialSlots,
  maxSlots,
  candidates,
  generateAction,
}: {
  slots: PairingAttempt[];
  maxSlots: number;
  candidates: PairingAttempt[];
  generateAction: (formData: FormData) => void;
}) {
  const [slots, setSlots] = useState<Array<PairingAttempt | null>>(initialSlots);
  const [generationRequestKey] = useState(() => crypto.randomUUID());
  const first = slots[0] ?? initialSlots[0]!;
  const replacementOptions = useMemo(() => {
    const used = new Set(slots.filter((item): item is PairingAttempt => Boolean(item)).map((item) => item.id));
    return candidates.filter((candidate) => candidate.compatibilityKey === first.compatibilityKey && !used.has(candidate.id));
  }, [candidates, first.compatibilityKey, slots]);
  const replace = (index: number, value: string) => setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? candidates.find((candidate) => candidate.id === value) ?? null : slot));
  const remove = (index: number) => setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? null : slot));
  const addSlot = () => setSlots((current) => [...current, null]);
  return (
    <form action={generateAction} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase text-slate-500">{first.compatibilityKey}</span>
        {slots.length < maxSlots ? <button type="button" onClick={addSlot} className="rounded border border-slate-700 px-2 py-1 text-xs">Add slot</button> : null}
      </div>
      <div className={`grid gap-2 ${slots.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {slots.map((slot, index) => (
          <div key={index} className="rounded-lg border border-slate-800 p-2">
            {slot ? <>
              <p className="text-brand-200 text-xs font-semibold">Slot {index + 1} · {orderItemReference(slot.orderNumber, slot.itemSequence ?? 1)}{slot.remainingCount && slot.remainingCount > 1 ? ` (x${slot.remainingCount})` : ""}</p>
              <p className="text-xs text-slate-300">{slot.customerName} · {slot.productName}</p>
              <p className="text-[11px] text-slate-500">Attempt {slot.attemptNumber} · {slot.priority}</p>
            </> : <p className="text-xs text-slate-500">Empty slot</p>}
            <div className="mt-2 flex gap-1">
              <button type="button" onClick={() => remove(index)} className="rounded border border-slate-700 px-2 py-1 text-[11px]">Remove</button>
              <select value="" onChange={(event) => replace(index, event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-1 py-1 text-[11px]">
                <option value="">{slot ? "Replace…" : "Add compatible transfer…"}</option>
                {replacementOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{orderItemReference(candidate.orderNumber, candidate.itemSequence ?? 1)} · {candidate.customerName}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      {slots.map((slot, index) => slot?.id ? <input key={`${index}-${slot.id}`} type="hidden" name="attempt" value={slot.id} /> : null)}
      <input type="hidden" name="generationRequestKey" value={generationRequestKey} />
      <button disabled={slots.filter(Boolean).length === 0} className="mt-3 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-semibold disabled:opacity-40">Generate Physical Sheet</button>
    </form>
  );
}
