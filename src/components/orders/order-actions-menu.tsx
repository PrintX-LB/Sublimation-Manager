"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreHorizontal, Eye, Pencil, CreditCard, Image as ImageIcon, Copy, XCircle } from "lucide-react";
import { duplicateOrderAction, transitionOrderAction, permanentlyDeleteTestOrderAction } from "@/app/(admin)/orders/actions";

export function OrderActionsMenu({
  order,
  firstItemId,
  adminUnlocked,
}: {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentState: string;
    isTestOrder?: boolean;
    stockCommitted?: boolean;
    hasStockHistory?: boolean;
  };
  firstItemId?: string;
  adminUnlocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("keydown", close); const rect = triggerRef.current?.getBoundingClientRect(); if (rect) setPosition({ top: Math.min(rect.bottom + 6, window.innerHeight - 420), left: Math.max(8, rect.right - 208) }); return () => document.removeEventListener("keydown", close); }, [open]);

  const isCancelled = order.status === "Cancelled";
  const isCompleted = order.status === "Completed" || order.status === "Delivered";
  const eligible = Boolean(adminUnlocked && order.isTestOrder && order.paymentState === "unpaid" && !order.stockCommitted && !order.hasStockHistory);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition shadow-sm border bg-white"
        aria-label="Order actions"
      >
        <MoreHorizontal size={15} />
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} style={{ top: position.top, left: position.left }} className="fixed w-52 rounded-xl border border-slate-200 bg-white shadow-xl z-[100] py-1 text-slate-700 text-sm">
          <Link
            href={`/orders/${order.id}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition"
            onClick={() => setOpen(false)}
          >
            <Eye size={14} />
            <span>View order</span>
          </Link>

          {!isCancelled && !isCompleted && (
            <Link
              href={`/orders/${order.id}/edit`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition"
              onClick={() => setOpen(false)}
            >
              <Pencil size={14} />
              <span>Edit quantities</span>
            </Link>
          )}

          {!isCancelled && order.paymentState !== "paid" && order.paymentState !== "overpaid" && (
            <Link
              href={`/orders/${order.id}#payment-section`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition"
              onClick={() => setOpen(false)}
            >
              <CreditCard size={14} />
              <span>Add payment</span>
            </Link>
          )}

          {firstItemId && (
            <Link
              href={`/orders/${order.id}/items/${firstItemId}/artwork`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition"
              onClick={() => setOpen(false)}
            >
              <ImageIcon size={14} />
              <span>Open artwork</span>
            </Link>
          )}

          {/* Duplicate order form */}
          <form
            action={duplicateOrderAction}
            className="w-full"
            onSubmit={() => setOpen(false)}
          >
            <input type="hidden" name="id" value={order.id} />
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition text-slate-700"
            >
              <Copy size={14} />
              <span>Duplicate order</span>
            </button>
          </form>

          {eligible ? <form action={permanentlyDeleteTestOrderAction} onSubmit={(event) => { const confirmation = window.prompt(`Permanently delete ${order.orderNumber}? Type the exact order number to confirm.`); if (confirmation !== order.orderNumber) event.preventDefault(); else setOpen(false); }}><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="confirmation" value={order.orderNumber}/><button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"><XCircle size={14}/>Permanently Delete Test Order</button></form> : null}

          {/* Change status action (if not cancelled) */}
          {!isCancelled && (
            <div className="border-t border-slate-100 my-1 pt-1">
              <span className="block px-3 py-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Change Status
              </span>
              <form action={transitionOrderAction} className="px-3 py-1 flex gap-1">
                <input type="hidden" name="id" value={order.id} />
                <select
                  name="status"
                  defaultValue={order.status}
                  onChange={(e) => e.target.form?.requestSubmit()}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="Draft">Draft</option>
                  <option value="Awaiting customer files">Awaiting files</option>
                  <option value="Design preparation">Design prep</option>
                  <option value="Awaiting customer approval">Awaiting approval</option>
                  <option value="Approved">Approved</option>
                  <option value="Ready to print">Ready to print</option>
                  <option value="In production">In production</option>
                  <option value="Completed">Completed</option>
                  <option value="Ready for collection">Ready collection</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                </select>
              </form>
            </div>
          )}

          {/* Cancel order action */}
          {!isCancelled && (
            <div className="border-t border-slate-100 my-1 pt-1">
              <form
                action={transitionOrderAction}
                onSubmit={(e) => {
                  if (!window.confirm("Cancel this order? This will restore any committed stock and cannot be undone.")) {
                    e.preventDefault();
                  } else {
                    setOpen(false);
                  }
                }}
              >
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="status" value="Cancelled" />
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 transition"
                >
                  <XCircle size={14} />
                  <span>Cancel order</span>
                </button>
              </form>
            </div>
          )}
        </div>, document.body) : null}
    </div>
  );
}
