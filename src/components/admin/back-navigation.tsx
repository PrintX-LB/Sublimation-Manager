"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export function isSafeReturnRoute(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const parsed = new URL(value, "http://printx.local");
    return parsed.origin === "http://printx.local" && parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}

interface BackNavigationProps {
  label: string;
  fallbackRoute: string;
  returnTo?: string;
}

function BackNavigationButton({ label, fallbackRoute, returnTo }: BackNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigateBack = () => {
    const queryReturn = searchParams.get("returnTo");
    const requested = returnTo ?? queryReturn;
    if (isSafeReturnRoute(requested) && requested !== pathname) {
      router.push(requested);
      return;
    }

    const referrer = document.referrer;
    if (window.history.length > 1 && referrer.startsWith(window.location.origin)) {
      router.back();
      return;
    }
    router.push(fallbackRoute);
  };

  return (
    <button
      type="button"
      onClick={navigateBack}
      className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      aria-label={`${label} (back)`}
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      {label}
    </button>
  );
}

export function BackNavigation(props: BackNavigationProps) {
  return (
    <Suspense
      fallback={
        <span className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-400">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {props.label}
        </span>
      }
    >
      <BackNavigationButton {...props} />
    </Suspense>
  );
}
