"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  FileImage,
  LayoutDashboard,
  Package,
  Printer,
  Settings,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/print-templates", label: "Print templates", icon: FileImage },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {open ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-slate-950 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500">
            <Printer aria-hidden="true" size={21} />
          </span>
          <div>
            <p className="font-bold tracking-tight">PrintFlow</p>
            <p className="text-xs text-slate-400">Sublimation studio</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="ml-auto rounded-lg p-2 text-slate-400 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Administration" className="flex-1 space-y-1 p-4">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${active ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon aria-hidden="true" size={19} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-5 text-xs leading-5 text-slate-400">
          Phase 1 foundation
          <br />
          Secure business workspace
        </div>
      </aside>
    </>
  );
}
