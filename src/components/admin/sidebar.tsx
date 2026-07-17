"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  FileImage,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  ClipboardList,
  Users,
  TrendingUp,
  X,
} from "lucide-react";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/production", label: "Production", icon: ClipboardList },
  { href: "/production/sheets", label: "Print Sheets", icon: FileImage },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/revenue", label: "Revenue", icon: TrendingUp },
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
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-[#0b0f19] border-r border-slate-800 text-slate-100 transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="relative flex h-20 items-center justify-center border-b border-slate-800 px-6 bg-[#080b12]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src="/branding/printx-sidebar-wordmark.png" 
            alt="PrintX" 
            className="h-9 w-auto select-none object-contain"
          />
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Administration" className="flex-1 space-y-1.5 p-4">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/production/sheets"
                ? pathname.startsWith("/production/sheets") ||
                  pathname.startsWith("/production/sheet-builder")
                : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold border transition-all duration-150 ${active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "text-slate-400 border-transparent hover:bg-slate-800/40 hover:text-slate-200 hover:border-slate-800"}`}
              >
                <Icon aria-hidden="true" size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 p-5 text-xs leading-5 text-slate-500 font-medium bg-[#080b12]">
          PrintX Workspace
          <br />
          <span className="text-slate-600">Local business administration</span>
        </div>
      </aside>
    </>
  );
}
