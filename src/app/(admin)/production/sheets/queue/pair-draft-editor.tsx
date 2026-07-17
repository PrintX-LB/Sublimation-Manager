"use client";

import { useMemo, useState } from "react";
import type { PairingAttempt } from "@/lib/production/sheet-pairing";
import { orderItemReference } from "@/lib/orders/item-reference";

export function PairDraftEditor({
  first,
  second,
  candidates,
  generateAction,
}: {
  first: PairingAttempt;
  second: PairingAttempt;
  candidates: PairingAttempt[];
  generateAction: (formData: FormData) => void;
}) {
  const [slots, setSlots] = useState<
    [PairingAttempt | null, PairingAttempt | null]
  >([first, second]);
  const [generationRequestKey] = useState(() => crypto.randomUUID());
  const replacementOptions = useMemo(() => {
    const used = new Set(
      slots
        .filter((item): item is PairingAttempt => Boolean(item))
        .map((item) => item.id),
    );
    return candidates.filter(
      (candidate) =>
        candidate.compatibilityKey === first.compatibilityKey &&
        !used.has(candidate.id),
    );
  }, [candidates, first.compatibilityKey, slots]);
  const swap = () => setSlots(([one, two]) => [two, one]);
  const replace = (index: 0 | 1, value: string) =>
    setSlots((current) => {
      const next = [...current] as [
        PairingAttempt | null,
        PairingAttempt | null,
      ];
      next[index] =
        candidates.find((candidate) => candidate.id === value) ?? null;
      return next;
    });
  return (
    <form
      action={generateAction}
      className="rounded-xl border border-slate-700 bg-slate-950/50 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase text-slate-500">
          {first.compatibilityKey}
        </span>
        <button
          type="button"
          onClick={swap}
          className="rounded border border-slate-700 px-2 py-1 text-xs"
        >
          Swap slots
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {slots.map((slot, index) => (
          <div key={index} className="rounded-lg border border-slate-800 p-2">
            {slot ? (
              <>
                <p className="text-brand-200 text-xs font-semibold">
                  Slot {index + 1} · {orderItemReference(slot.orderNumber, slot.itemSequence ?? 1)}
                </p>
                <p className="text-xs text-slate-300">
                  {slot.customerName} · {slot.productName}
                </p>
                <p className="text-[11px] text-slate-500">
                  Attempt {slot.attemptNumber} · {slot.priority}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">Empty slot</p>
            )}
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                onClick={() =>
                  setSlots((current) =>
                    index === 0 ? [current[1], null] : [current[0], null],
                  )
                }
                className="rounded border border-slate-700 px-2 py-1 text-[11px]"
              >
                Remove
              </button>
              {slot ? (
                <select
                  value=""
                  onChange={(event) =>
                    replace(index as 0 | 1, event.target.value)
                  }
                  className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-1 py-1 text-[11px]"
                >
                  <option value="">Replace…</option>
                  {replacementOptions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {orderItemReference(candidate.orderNumber, candidate.itemSequence ?? 1)} · {candidate.customerName}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value=""
                  onChange={(event) =>
                    replace(index as 0 | 1, event.target.value)
                  }
                  className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-1 py-1 text-[11px]"
                >
                  <option value="">Add compatible transfer…</option>
                  {replacementOptions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {orderItemReference(candidate.orderNumber, candidate.itemSequence ?? 1)} · {candidate.customerName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
      <input type="hidden" name="attempt1" value={slots[0]?.id ?? ""} />
      <input
        type="hidden"
        name="generationRequestKey"
        value={generationRequestKey}
      />
      {slots[1] ? (
        <input type="hidden" name="attempt2" value={slots[1].id} />
      ) : null}
      <button className="mt-3 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-semibold">
        Generate Physical Sheet
      </button>
    </form>
  );
}
