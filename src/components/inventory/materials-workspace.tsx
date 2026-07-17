"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Archive,
  Edit3,
  LockKeyhole,
  MoreHorizontal,
  PackagePlus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  addInventoryStockAction,
  adjustInventoryAction,
  createInventoryItemAction,
  recordInventoryWasteAction,
  removeInventoryItemAction,
  updateInventoryItemAction,
  type MaterialActionState,
} from "@/app/(admin)/inventory/items/actions";
import {
  inventoryQuantityLabel,
  type InventoryUnit,
} from "@/lib/inventory/materials";
import { formatUSD } from "@/lib/money";

export type MaterialWorkspaceItem = {
  id: string;
  name: string;
  baseUnit: InventoryUnit;
  currentQuantity: string;
  minimumQuantity: string;
  unitCost: string;
  brand: string | null;
  supplier: string | null;
  storageLocation: string | null;
  notes: string | null;
  isActive: boolean;
  transactionCount: number;
  recipeReferenceCount: number;
  hasHistory: boolean;
  canChangeUnit: boolean;
};

type MaterialFilter = "active" | "inactive" | "all";

function useEscapeClose(close: () => void, blocked: boolean) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !blocked) close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [blocked, close]);
}

function ModalFrame({
  title,
  description,
  close,
  children,
  blocked = false,
  destructive = false,
}: {
  title: string;
  description: string;
  close: () => void;
  children: ReactNode;
  blocked?: boolean;
  destructive?: boolean;
}) {
  useEscapeClose(close, blocked);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-modal-title"
        className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-[#111827] shadow-2xl ${destructive ? "border-red-500/40" : "border-slate-700"}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <h2
              id="material-modal-title"
              className={`font-semibold ${destructive ? "text-red-300" : "text-slate-100"}`}
            >
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={blocked}
            aria-label="Close dialog"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

const textInputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-lpignore": "true",
} as const;
const inputClass =
  "h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const initialMaterialActionState: MaterialActionState = {
  ok: false,
  message: "",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-xs font-medium text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CreateMaterialModal({
  close,
  completed,
}: {
  close: () => void;
  completed: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    createInventoryItemAction,
    initialMaterialActionState,
  );
  useEffect(() => {
    if (state.ok) completed(state.message);
  }, [completed, state]);
  return (
    <ModalFrame
      title="Add Material"
      description="Create a workshop material without exposing internal inventory units."
      close={close}
      blocked={pending}
    >
      <form action={action} autoComplete="off" className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              autoFocus
              required
              name="materialName"
              {...textInputProps}
              className={inputClass}
            />
          </Field>
          <Field label="Opening quantity">
            <input
              name="openingQuantity"
              type="number"
              min="0"
              step="1"
              defaultValue="0"
              className={inputClass}
            />
          </Field>
          <Field label="Minimum stock">
            <input
              name="minimumQuantity"
              type="number"
              min="0"
              step="1"
              defaultValue="0"
              className={inputClass}
            />
          </Field>
          <Field label="Unit cost">
            <input
              name="unitCost"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className={inputClass}
            />
          </Field>
          <Field label="Brand">
            <input
              name="materialBrand"
              {...textInputProps}
              className={inputClass}
            />
          </Field>
          <Field label="Supplier">
            <input
              name="materialSupplier"
              {...textInputProps}
              className={inputClass}
            />
          </Field>
          <Field label="Storage location">
            <input
              name="materialStorageLocation"
              {...textInputProps}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            name="materialNotes"
            {...textInputProps}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </Field>
        {state.message && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-200"
          >
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create Material"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function EditMaterialModal({
  item,
  close,
  completed,
}: {
  item: MaterialWorkspaceItem;
  close: () => void;
  completed: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    updateInventoryItemAction,
    initialMaterialActionState,
  );
  useEffect(() => {
    if (state.ok) completed(state.message);
  }, [completed, state]);
  const unitWarning =
    item.transactionCount > 0
      ? "The unit cannot be changed because this material already has stock history."
      : item.recipeReferenceCount > 0
        ? "The unit cannot be changed because this material is used by a production recipe."
        : null;
  return (
    <ModalFrame
      title={`Edit ${item.name}`}
      description="Update material details without changing its current stock quantity."
      close={close}
      blocked={pending}
    >
      <form action={action} autoComplete="off" className="space-y-4 p-5">
        <input type="hidden" name="inventoryItemId" value={item.id} />
        <input type="hidden" name="baseUnit" value={item.baseUnit} />
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400">Current quantity</p>
          <p className="mt-1 font-semibold text-slate-100">
            {quantityLabel(item.currentQuantity, item.baseUnit)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Use Add Stock, Adjust or Record Waste to change this balance.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              autoFocus
              required
              name="materialEditName"
              defaultValue={item.name}
              {...textInputProps}
              className={inputClass}
            />
          </Field>
          <Field label="Minimum stock">
            <input
              name="minimumQuantity"
              type="number"
              min="0"
              step="1"
              defaultValue={item.minimumQuantity}
              className={inputClass}
            />
          </Field>
          <Field label="Unit cost">
            <input
              name="unitCost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item.unitCost}
              className={inputClass}
            />
          </Field>
          <Field label="Brand">
            <input
              name="materialEditBrand"
              defaultValue={item.brand ?? ""}
              {...textInputProps}
              className={inputClass}
            />
          </Field>
          <Field label="Supplier">
            <input
              name="materialEditSupplier"
              defaultValue={item.supplier ?? ""}
              {...textInputProps}
              className={inputClass}
            />
          </Field>
          <Field label="Storage location">
            <input
              name="materialEditStorageLocation"
              defaultValue={item.storageLocation ?? ""}
              {...textInputProps}
              className={inputClass}
            />
          </Field>
        </div>
        {unitWarning ? (
          <p className="text-xs text-amber-300">{unitWarning}</p>
        ) : null}
        <Field label="Notes">
          <textarea
            name="materialEditNotes"
            defaultValue={item.notes ?? ""}
            {...textInputProps}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </Field>
        {state.message && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-200"
          >
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save Material"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function RemoveMaterialModal({
  item,
  close,
  completed,
}: {
  item: MaterialWorkspaceItem;
  close: () => void;
  completed: (message: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    removeInventoryItemAction,
    initialMaterialActionState,
  );
  useEffect(() => {
    if (state.ok) completed(state.message);
  }, [completed, state]);
  const archive = item.hasHistory;
  return (
    <ModalFrame
      title={archive ? "Archive Material" : "Delete Material"}
      description="Admin Mode is required for this destructive action."
      close={close}
      blocked={pending}
      destructive
    >
      <form
        ref={formRef}
        action={action}
        autoComplete="off"
        className="space-y-4 p-5"
      >
        <input type="hidden" name="inventoryItemId" value={item.id} />
        <div className="space-y-2 rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-sm">
          <p className="font-semibold text-red-200">{item.name}</p>
          <p className="text-slate-300">
            Current stock: {quantityLabel(item.currentQuantity, item.baseUnit)}
          </p>
          <p className="text-slate-300">
            History or references: {item.hasHistory ? "Yes" : "No"}
          </p>
          <p className="text-red-200/90">
            {archive
              ? "This material will be archived. Stock, recipes and transaction history will remain available."
              : "This unused material will be permanently deleted and cannot be recovered."}
          </p>
        </div>
        <p className="text-sm font-semibold text-red-200">Are you sure you want to continue?</p>
        {state.message && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-200"
          >
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => {
              formRef.current?.reset();
              close();
            }}
            disabled={pending}
            className="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            name="materialRemovalConfirmation"
            value="yes"
            className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending
              ? "Working…"
              : archive
                ? "Archive Material"
                : "Delete Material"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function quantityLabel(value: number | string, unit: InventoryUnit) {
  void unit;
  const number = typeof value === "number" ? value : Number(value);
  const formatted = Number.isFinite(number)
    ? number.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "—";
  return `${formatted} ${inventoryQuantityLabel(number)}`;
}

function OperationSummary({
  item,
  nextQuantity,
}: {
  item: MaterialWorkspaceItem;
  nextQuantity: number;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:grid-cols-2">
      <div>
        <p className="text-xs text-slate-500">Current stock</p>
        <p className="mt-1 font-semibold text-slate-100">
          {quantityLabel(item.currentQuantity, item.baseUnit)}
        </p>
      </div>
      <div>
        <p className="text-xs text-slate-500">New balance</p>
        <p
          className={`mt-1 font-semibold ${nextQuantity < 0 ? "text-red-300" : "text-emerald-300"}`}
        >
          {quantityLabel(nextQuantity, item.baseUnit)}
        </p>
      </div>
    </div>
  );
}

function ActionError({ state }: { state: MaterialActionState }) {
  return state.message && !state.ok ? (
    <p
      role="alert"
      className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-200"
    >
      {state.message}
    </p>
  ) : null;
}

function AddStockModal({
  item,
  close,
  completed,
}: {
  item: MaterialWorkspaceItem;
  close: () => void;
  completed: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [state, action, pending] = useActionState(
    addInventoryStockAction,
    initialMaterialActionState,
  );
  useEffect(() => {
    if (state.ok) completed(state.message);
  }, [completed, state]);
  const parsedQuantity = Number(quantity);
  const quantityValid =
    /^\d+$/.test(quantity) &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0;
  const nextQuantity =
    Number(item.currentQuantity) + (quantityValid ? parsedQuantity : 0);
  return (
    <ModalFrame
      title={`Add Stock — ${item.name}`}
      description="Record a purchase or other stock addition. The weighted-average unit cost will be updated."
      close={close}
      blocked={pending}
    >
      <form action={action} autoComplete="off" className="space-y-4 p-5">
        <input type="hidden" name="inventoryItemId" value={item.id} />
        <OperationSummary item={item} nextQuantity={nextQuantity} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantity to add (units)">
            <input
              autoFocus
              required
              name="quantity"
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Purchase unit cost">
            <input
              required
              name="unitCost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item.unitCost}
              className={inputClass}
            />
          </Field>
          <Field label="Supplier">
            <input
              name="stockSupplier"
              defaultValue={item.supplier ?? ""}
              {...textInputProps}
              className={inputClass}
            />
          </Field>
          <Field label="Reference or invoice number">
            <input
              name="stockReference"
              {...textInputProps}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Optional notes">
          <textarea
            name="stockNotes"
            {...textInputProps}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
          />
        </Field>
        {quantity && !quantityValid ? (
          <p className="text-sm text-red-300">
            Inventory quantities must be whole units.
          </p>
        ) : null}
        <ActionError state={state} />
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !quantityValid}
            className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add Stock"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function AdjustStockModal({
  item,
  close,
  completed,
}: {
  item: MaterialWorkspaceItem;
  close: () => void;
  completed: (message: string) => void;
}) {
  const [delta, setDelta] = useState("");
  const [state, action, pending] = useActionState(
    adjustInventoryAction,
    initialMaterialActionState,
  );
  useEffect(() => {
    if (state.ok) completed(state.message);
  }, [completed, state]);
  const parsedDelta = Number(delta);
  const deltaValid =
    /^[+-]?\d+$/.test(delta) &&
    Number.isFinite(parsedDelta) &&
    parsedDelta !== 0;
  const nextQuantity =
    Number(item.currentQuantity) + (deltaValid ? parsedDelta : 0);
  const canSubmit = deltaValid && nextQuantity >= 0;
  return (
    <ModalFrame
      title={`Adjust Stock — ${item.name}`}
      description="Enter the signed difference to create an immutable manual adjustment."
      close={close}
      blocked={pending}
    >
      <form action={action} autoComplete="off" className="space-y-4 p-5">
        <input type="hidden" name="inventoryItemId" value={item.id} />
        <OperationSummary item={item} nextQuantity={nextQuantity} />
        <Field label="Adjustment quantity (units)">
          <input
            autoFocus
            required
            name="delta"
            type="number"
            step="1"
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
            placeholder="Example: +5 or -2"
            className={inputClass}
          />
        </Field>
        <Field label="Reason">
          <input
            required
            name="adjustmentReason"
            {...textInputProps}
            className={inputClass}
          />
        </Field>
        <Field label="Optional notes">
          <textarea
            name="adjustmentNotes"
            {...textInputProps}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
          />
        </Field>
        {delta && !deltaValid ? (
          <p className="text-sm text-red-300">
            Inventory quantities must be whole units.
          </p>
        ) : null}
        {nextQuantity < 0 ? (
          <p className="text-sm text-red-300">
            The adjustment cannot make stock negative.
          </p>
        ) : null}
        <ActionError state={state} />
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Confirm Adjustment"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function RecordWasteModal({
  item,
  close,
  completed,
}: {
  item: MaterialWorkspaceItem;
  close: () => void;
  completed: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [state, action, pending] = useActionState(
    recordInventoryWasteAction,
    initialMaterialActionState,
  );
  useEffect(() => {
    if (state.ok) completed(state.message);
  }, [completed, state]);
  const parsedQuantity = Number(quantity);
  const quantityValid =
    /^\d+$/.test(quantity) &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0;
  const nextQuantity =
    Number(item.currentQuantity) - (quantityValid ? parsedQuantity : 0);
  const canSubmit = quantityValid && nextQuantity >= 0;
  return (
    <ModalFrame
      title={`Record Waste — ${item.name}`}
      description="Record damaged, spoiled or unusable material as an immutable waste transaction."
      close={close}
      blocked={pending}
      destructive
    >
      <form action={action} autoComplete="off" className="space-y-4 p-5">
        <input type="hidden" name="inventoryItemId" value={item.id} />
        <OperationSummary item={item} nextQuantity={nextQuantity} />
        <Field label="Quantity wasted (units)">
          <input
            autoFocus
            required
            name="quantity"
            type="number"
            min="0"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Waste reason">
          <input
            required
            name="wasteReason"
            {...textInputProps}
            className={inputClass}
          />
        </Field>
        <Field label="Optional notes">
          <textarea
            name="wasteNotes"
            {...textInputProps}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
          />
        </Field>
        {quantity && !quantityValid ? (
          <p className="text-sm text-red-300">
            Inventory quantities must be whole units.
          </p>
        ) : null}
        {nextQuantity < 0 ? (
          <p className="text-sm text-red-300">
            Waste cannot exceed the available stock.
          </p>
        ) : null}
        <ActionError state={state} />
        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Recording…" : "Record Waste"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function MaterialsWorkspace({
  items,
  adminUnlocked,
  filter,
}: {
  items: MaterialWorkspaceItem[];
  adminUnlocked: boolean;
  filter: MaterialFilter;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<MaterialWorkspaceItem | null>(null);
  const [removeItem, setRemoveItem] = useState<MaterialWorkspaceItem | null>(
    null,
  );
  const [stockOperation, setStockOperation] = useState<{
    type: "add" | "adjust" | "waste";
    item: MaterialWorkspaceItem;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const completed = (message: string) => {
    setCreateOpen(false);
    setEditItem(null);
    setRemoveItem(null);
    setStockOperation(null);
    setNotice(message);
    router.refresh();
  };
  const materialCards = useMemo(
    () =>
      items.map((item) => {
        const low =
          item.isActive &&
          Number(item.currentQuantity) <= Number(item.minimumQuantity);
        return (
          <article
            key={item.id}
            className="rounded-xl border border-slate-800 bg-[#1e293b] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4
                  className="truncate font-semibold text-slate-100"
                  title={item.name}
                >
                  {item.name}
                </h4>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {[item.brand, item.supplier].filter(Boolean).join(" · ") ||
                    "No supplier or brand"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs ${!item.isActive ? "bg-slate-700 text-slate-300" : low ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}
              >
                {!item.isActive ? "Inactive" : low ? "Low stock" : "Healthy"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-slate-500">On hand</p>
                <p className="text-slate-100">
                  {quantityLabel(item.currentQuantity, item.baseUnit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Minimum</p>
                <p className="text-slate-100">{item.minimumQuantity}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Unit cost</p>
                <p className="text-slate-100">{formatUSD(item.unitCost)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
              {item.isActive ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStockOperation({ type: "add", item })}
                    className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Add Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockOperation({ type: "adjust", item })}
                    className="h-8 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Adjust
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockOperation({ type: "waste", item })}
                    className="h-8 rounded-lg border border-red-500/40 px-3 text-xs font-semibold text-red-300 hover:bg-red-950/30"
                  >
                    Record Waste
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setEditItem(item)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                <Edit3 size={14} /> Edit
              </button>
              <details className="relative">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                  <MoreHorizontal size={14} /> More
                </summary>
                <div className="absolute right-0 z-20 mt-1 min-w-52 rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-xl">
                  {adminUnlocked ? (
                    <button
                      type="button"
                      onClick={() => setRemoveItem(item)}
                      className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-xs font-semibold text-red-300 hover:bg-red-950/40"
                    >
                      {item.hasHistory ? (
                        <Archive size={14} />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      {item.hasHistory ? "Archive material" : "Delete material"}
                    </button>
                  ) : (
                    <Link
                      href="/settings"
                      className="flex min-h-9 items-center gap-2 rounded-md px-3 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      <LockKeyhole size={14} /> Unlock Admin Mode to archive or
                      delete
                    </Link>
                  )}
                </div>
              </details>
            </div>
          </article>
        );
      }),
    [adminUnlocked, items],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Materials &amp; Supplies
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Paper, ink, tape, packaging, boxes and workshop consumables.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setCreateOpen(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus size={16} /> Add Material
          </button>
        </div>
      </div>
      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/20 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300"
        >
          {notice}
        </p>
      ) : null}
      <nav aria-label="Material status filter" className="flex gap-2">
        {(["active", "inactive", "all"] as const).map((status) => (
          <Link
            key={status}
            href={`/inventory?tab=materials&materialStatus=${status}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize ${filter === status ? "text-brand-300 border-brand-500/40 bg-brand-500/10" : "border-slate-800 text-slate-400 hover:text-slate-200"}`}
          >
            {status}
          </Link>
        ))}
      </nav>
      <div className="grid gap-3 lg:grid-cols-2">
        {materialCards}
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500 lg:col-span-2">
            <PackagePlus className="mx-auto mb-2 text-slate-600" size={28} />
            No {filter === "all" ? "" : `${filter} `}materials found.
          </div>
        ) : null}
      </div>
      {createOpen ? (
        <CreateMaterialModal
          close={() => setCreateOpen(false)}
          completed={completed}
        />
      ) : null}
      {editItem ? (
        <EditMaterialModal
          key={editItem.id}
          item={editItem}
          close={() => setEditItem(null)}
          completed={completed}
        />
      ) : null}
      {removeItem ? (
        <RemoveMaterialModal
          key={removeItem.id}
          item={removeItem}
          close={() => setRemoveItem(null)}
          completed={completed}
        />
      ) : null}
      {stockOperation?.type === "add" ? (
        <AddStockModal
          key={`add-${stockOperation.item.id}`}
          item={stockOperation.item}
          close={() => setStockOperation(null)}
          completed={completed}
        />
      ) : null}
      {stockOperation?.type === "adjust" ? (
        <AdjustStockModal
          key={`adjust-${stockOperation.item.id}`}
          item={stockOperation.item}
          close={() => setStockOperation(null)}
          completed={completed}
        />
      ) : null}
      {stockOperation?.type === "waste" ? (
        <RecordWasteModal
          key={`waste-${stockOperation.item.id}`}
          item={stockOperation.item}
          close={() => setStockOperation(null)}
          completed={completed}
        />
      ) : null}
    </div>
  );
}
