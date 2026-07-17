"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isArtworkEditor = /\/orders\/[^/]+\/items\/[^/]+\/artwork$/.test(pathname);
  return (
    <div className={`${isArtworkEditor ? "h-screen overflow-hidden" : "min-h-screen"} bg-[#0f172a] text-slate-100`}>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center border-b border-slate-800 bg-[#0b0f19]/80 px-4 backdrop-blur-md sm:px-8">
          <button
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden transition-colors"
          >
            <Menu />
          </button>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Local workspace
              </p>
              <p className="hidden text-[11px] text-slate-500 sm:block font-medium mt-0.5">
                Data secured locally on this device
              </p>
            </div>
          </div>
        </header>
        <main className={isArtworkEditor ? "h-[calc(100dvh-5rem)] min-h-0 overflow-hidden bg-[#0f172a] p-3 sm:p-4 lg:p-5" : "min-h-[calc(100vh-5rem)] bg-[#0f172a] p-4 sm:p-8 lg:p-10"}>
          {children}
        </main>
      </div>
    </div>
  );
}
