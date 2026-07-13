"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

interface DatePickerProps {
  name: string;
  defaultValue?: string;
}

// Helper to format date as DD/MM/YYYY
function formatDate(date: Date | null): string {
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Helper to parse date from DD/MM/YYYY
function parseDate(str: string): Date | null {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0] || "", 10);
  const month = parseInt(parts[1] || "", 10) - 1;
  const year = parseInt(parts[2] || "", 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

export function DatePicker({ name, defaultValue = "" }: DatePickerProps) {
  const [selected, setSelected] = useState<Date | null>(() => parseDate(defaultValue || ""));
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const initial = parseDate(defaultValue || "") || new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Close calendar on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const selectDate = (date: Date) => {
    if (date < todayMidnight) return; // Disable past dates
    setSelected(date);
    setIsOpen(false);
  };

  const handleQuickSelect = (daysOffset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    date.setHours(0, 0, 0, 0);
    setSelected(date);
    setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsOpen(false);
  };

  const clearDate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(null);
  };

  // Calendar rendering math
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // First day of the month (0 = Sunday, 1 = Monday, etc.)
  const firstDayIndex = new Date(year, month, 1).getDay();
  // Total days in month
  const totalDays = new Date(year, month + 1, 0).getDate();

  const daysArray: (Date | null)[] = [];
  // Fill leading empty cells
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  // Fill month days
  for (let d = 1; d <= totalDays; d++) {
    daysArray.push(new Date(year, month, d));
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const formattedInputValue = selected ? formatDate(selected) : "";

  return (
    <div className="relative" ref={containerRef}>
      {/* Hidden input submitting format DD/MM/YYYY */}
      <input type="hidden" name={name} value={formattedInputValue} />

      {/* Trigger input wrapper */}
      <div
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-[#0f172a] px-3.5 py-2.5 text-sm text-slate-200 cursor-pointer select-none focus-within:ring-1 focus-within:ring-brand-500 transition"
      >
        <span className={selected ? "text-slate-200" : "text-slate-500"}>
          {selected ? formatDate(selected) : "Choose a due date..."}
        </span>
        <div className="flex items-center gap-1.5">
          {selected && (
            <button
              type="button"
              onClick={clearDate}
              className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
              title="Clear date"
            >
              <X size={14} />
            </button>
          )}
          <CalendarIcon size={16} className="text-slate-400 shrink-0" />
        </div>
      </div>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className="absolute right-0 sm:left-0 z-50 mt-2 w-72 rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-xl select-none">
          {/* Quick Selections */}
          <div className="grid grid-cols-4 gap-1 border-b border-slate-800/80 pb-3 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
            <button
              type="button"
              onClick={() => handleQuickSelect(0)}
              className="py-1 rounded bg-[#0f172a] border border-slate-800/80 hover:bg-slate-800 text-slate-300 transition"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(1)}
              className="py-1 rounded bg-[#0f172a] border border-slate-800/80 hover:bg-slate-800 text-slate-300 transition"
            >
              Tmrw
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(3)}
              className="py-1 rounded bg-[#0f172a] border border-slate-800/80 hover:bg-slate-800 text-slate-300 transition"
            >
              3 Days
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(7)}
              className="py-1 rounded bg-[#0f172a] border border-slate-800/80 hover:bg-slate-800 text-slate-300 transition"
            >
              1 Week
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3 text-slate-200">
            <span className="text-xs font-bold tracking-wide">
              {monthNames[month]} {year}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded bg-[#0f172a] border border-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded bg-[#0f172a] border border-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Grid of days */}
          <div className="grid grid-cols-7 gap-1 text-xs">
            {daysArray.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;

              const isPast = day < todayMidnight;
              const isSelected = selected &&
                day.getDate() === selected.getDate() &&
                day.getMonth() === selected.getMonth() &&
                day.getFullYear() === selected.getFullYear();

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={isPast}
                  onClick={() => selectDate(day)}
                  className={`py-1.5 rounded text-center transition font-semibold ${
                    isSelected
                      ? "bg-[#10B981] text-white"
                      : isPast
                      ? "text-slate-600 cursor-not-allowed opacity-30"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
