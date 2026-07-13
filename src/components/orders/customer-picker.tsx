"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Search, UserPlus, User } from "lucide-react";

type Customer = {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string | null;
  email: string | null;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-indigo-100 text-indigo-700",
    "bg-rose-100 text-rose-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function matches(customer: Customer, query: string): boolean {
  const q = query.toLowerCase();
  return (
    customer.fullName.toLowerCase().includes(q) ||
    customer.customerNumber.toLowerCase().includes(q) ||
    (customer.phone ?? "").toLowerCase().includes(q) ||
    (customer.email ?? "").toLowerCase().includes(q)
  );
}

export function CustomerPicker({
  customers,
  defaultCustomerId,
  inputName = "customerId",
  onChange,
}: {
  customers: Customer[];
  defaultCustomerId?: string;
  inputName?: string;
  onChange?: (customer: Customer | null) => void;
}) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Derive default selected customer from defaultCustomerId prop
  const defaultCustomer = defaultCustomerId
    ? customers.find((c) => c.id === defaultCustomerId) ?? null
    : null;

  const [selected, setSelected] = useState<Customer | null>(defaultCustomer);
  const [query, setQuery] = useState(
    defaultCustomer ? `${defaultCustomer.fullName} (${defaultCustomer.customerNumber})` : ""
  );
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Broadcast initial customer choice
  useEffect(() => {
    if (defaultCustomer) {
      onChange?.(defaultCustomer);
    }
  }, [defaultCustomer, onChange]);

  const filtered = query.length > 0 && !selected
    ? customers.filter((c) => matches(c, query))
    : [];

  const showDropdown = open && (filtered.length > 0 || (query.length > 0 && !selected));

  const selectCustomer = useCallback((customer: Customer) => {
    setSelected(customer);
    setQuery(`${customer.fullName} (${customer.customerNumber})`);
    setOpen(false);
    setHighlightedIndex(-1);
    onChange?.(customer);
  }, [onChange]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setQuery("");
    setHighlightedIndex(-1);
    onChange?.(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onChange]);

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

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const itemCount = filtered.length + 1; // +1 for "Create new customer" at the end
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % itemCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? itemCount - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        const customer = filtered[highlightedIndex];
        if (customer) selectCustomer(customer);
      } else if (highlightedIndex === filtered.length) {
        // "Create new customer" item
        window.location.href = "/customers/new";
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Hidden field — always submits the UUID or empty string */}
      <input
        type="hidden"
        name={inputName}
        value={selected?.id ?? ""}
      />

      {/* Visible search input */}
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
          }
          value={query}
          placeholder="Search by name, number, phone or email…"
          autoComplete="off"
          className="w-full rounded-xl border py-3 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition bg-white"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if (!selected) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {selected && (
          <button
            type="button"
            aria-label="Clear customer selection"
            onClick={clearSelection}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label="Customer search results"
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl text-sm"
        >
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-slate-400 italic">No customers found.</li>
          )}

          {filtered.map((customer, index) => {
            const isHighlighted = index === highlightedIndex;
            const avatarColor = getAvatarColor(customer.fullName);
            const secondary = [
              customer.customerNumber,
              customer.phone,
              customer.email,
            ]
              .filter(Boolean)
              .join(" • ");

            return (
              <li
                key={customer.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={selected?.id === customer.id}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${
                  isHighlighted ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur
                  selectCustomer(customer);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {/* Avatar */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ${avatarColor}`}
                >
                  {getInitials(customer.fullName)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {customer.fullName}
                  </p>
                  {secondary && (
                    <p className="truncate text-xs text-slate-500 mt-0.5">{secondary}</p>
                  )}
                </div>

                {/* Selection indicator */}
                {selected?.id === customer.id && (
                  <svg
                    className="shrink-0 text-brand-600"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M13.707 4.293a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L6 10.586l6.293-6.293a1 1 0 0 1 1.414 0z" />
                  </svg>
                )}
              </li>
            );
          })}

          {/* Create new customer escape hatch */}
          <li
            id={`${listboxId}-option-${filtered.length}`}
            role="option"
            aria-selected={false}
            className={`flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-2.5 font-medium transition-colors ${
              highlightedIndex === filtered.length
                ? "bg-brand-50 text-brand-700"
                : "text-brand-600 hover:bg-slate-50"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              window.location.href = "/customers/new";
            }}
            onMouseEnter={() => setHighlightedIndex(filtered.length)}
          >
            <UserPlus size={14} className="shrink-0" />
            <span>+ Create new customer</span>
          </li>
        </ul>
      )}

      {/* Selected customer preview pill */}
      {selected && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase ${getAvatarColor(selected.fullName)}`}
          >
            {getInitials(selected.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{selected.fullName}</p>
            <p className="text-[11px] text-slate-500">{selected.customerNumber}</p>
          </div>
          <User size={13} className="shrink-0 text-brand-400" />
        </div>
      )}
    </div>
  );
}
