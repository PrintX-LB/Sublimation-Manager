"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";

export function AdminShell({
  children,
  email,
  signOutAction,
}: {
  children: React.ReactNode;
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center border-b bg-white/90 px-4 backdrop-blur sm:px-8">
          <button
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 lg:hidden"
          >
            <Menu />
          </button>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">
                Company account
              </p>
              <p className="max-w-56 truncate text-xs text-slate-500">
                {email}
              </p>
            </div>
            <form action={signOutAction}>
              <button className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="p-4 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
