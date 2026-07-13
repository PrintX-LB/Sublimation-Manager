"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { ChevronDown, Check } from "lucide-react";

type Category = {
  id: string;
  name: string;
  isArchived?: boolean;
};

export function CategoryPicker({
  categories,
  defaultValue = "",
  name = "categoryId",
}: {
  categories: Category[];
  defaultValue?: string;
  name?: string;
}) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Sort categories alphabetically
  const sortedCategories = [...categories].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const defaultCategory = defaultValue
    ? sortedCategories.find((c) => c.id === defaultValue) ?? null
    : null;

  const [selected, setSelected] = useState<Category | null>(defaultCategory);
  const [query, setQuery] = useState(defaultCategory ? defaultCategory.name : "");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const filtered = query.length > 0 && !selected
    ? sortedCategories.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      )
    : sortedCategories;

  const selectCategory = useCallback((category: Category) => {
    setSelected(category);
    setQuery(category.name);
    setOpen(false);
    setHighlightedIndex(-1);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setQuery("");
    setHighlightedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Close on outside click
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        const cat = filtered[highlightedIndex];
        if (cat) selectCategory(cat);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div className="relative mt-2" ref={containerRef}>
      {/* Hidden input field for form validation */}
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      {/* Selector/Input Field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          value={query}
          placeholder="Search categories..."
          autoComplete="off"
          className="w-full rounded-xl border border-slate-800 bg-[#0f172a] py-3 pl-3 pr-10 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selected && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition"
              title="Clear selection"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <ChevronDown size={16} className="text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-800 bg-[#1e293b] py-1 shadow-xl text-sm"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-slate-500 italic">No categories found</li>
          ) : (
            filtered.map((cat, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isSelected = selected?.id === cat.id;

              return (
                <li
                  key={cat.id}
                  id={`${listboxId}-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors ${
                    isHighlighted ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/50"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    selectCategory(cat);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cat.name}</span>
                    {cat.isArchived && (
                      <span className="inline-flex items-center px-1.5 py-0.25 rounded text-[9px] font-bold bg-slate-900 text-slate-500 border border-slate-800 uppercase tracking-wider">
                        Archived
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={14} className="text-emerald-500" />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
