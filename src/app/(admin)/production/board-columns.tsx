"use client";

import { useState } from "react";

export function CollapsibleBoard({
  readyToPrint,
  inProduction,
  completed,
}: {
  readyToPrint: React.ReactNode;
  inProduction: React.ReactNode;
  completed: React.ReactNode;
}) {
  const [completedMinimized, setCompletedMinimized] = useState(true);

  return (
    <div
      className={`grid min-w-[960px] gap-4 transition-all duration-300 ${
        completedMinimized ? "grid-cols-[1fr_1fr_60px]" : "grid-cols-3"
      }`}
    >
      {readyToPrint}
      {inProduction}
      <div
        className={`flex min-h-[300px] flex-col rounded-xl border border-slate-700 bg-slate-950/50 ${
          completedMinimized ? "cursor-pointer hover:bg-slate-900/50" : ""
        }`}
        onClick={() => {
          if (completedMinimized) setCompletedMinimized(false);
        }}
        title={completedMinimized ? "Expand Completed" : undefined}
      >
        {completedMinimized ? (
          <div className="flex h-full flex-col items-center justify-center py-6 text-slate-400 hover:text-slate-200">
            <span
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
              className="rotate-180 text-xs font-bold uppercase tracking-widest"
            >
              Completed
            </span>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <h2 className="text-sm font-semibold text-slate-200">Completed</h2>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCompletedMinimized(true);
                }}
                className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                title="Minimize Column"
              >
                Minimize
              </button>
            </header>
            <div className="flex-1 overflow-hidden transition-all duration-300 opacity-100">
              {completed}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
