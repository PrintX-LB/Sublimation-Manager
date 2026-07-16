"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  DollarSign,
  Briefcase,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Coins
} from "lucide-react";
import { formatUSD } from "@/lib/money";
interface ProductRow {
  name: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
}

interface CustomerRow {
  name: string;
  ordersCount: number;
  revenue: number;
  paid: number;
  due: number;
}

interface PaymentRow {
  id: string;
  date: string;
  customerName: string;
  orderNumber: string;
  method: string;
  amount: number;
}

interface ChartDataPoint {
  label: string;
  orderRevenue: number;
  collectedRevenue: number;
  profit: number;
}

interface OrderStatusCount {
  status: string;
  count: number;
}

interface RevenueDashboardProps {
  stats: {
    orderRevenue: number;
    collectedRevenue: number;
    outstandingBalance: number;
    estimatedCost: number;
    estimatedProfit: number;
    completedOrdersCount: number;
    revenueThisYear: number;
    revenueToday: number;
    revenueThisMonth: number;
    averageOrderValue: number;
  };
  filters: {
    year: number;
    month: string | number;
    startDate: string;
    endDate: string;
  };
  products: ProductRow[];
  customers: CustomerRow[];
  payments: PaymentRow[];
  chartData: ChartDataPoint[];
  statusBreakdown: OrderStatusCount[];
  csvOrders: Array<{
    date: string;
    orderNumber: string;
    customerName: string;
    status: string;
    total: number;
    paid: number;
    due: number;
    cost: number;
    profit: number;
  }>;
}

export function RevenueDashboard({
  stats,
  filters,
  products,
  customers,
  payments,
  chartData,
  statusBreakdown,
  csvOrders,
}: RevenueDashboardProps) {
  const router = useRouter();

  // Date states
  const [year, setYear] = useState(filters.year);
  const [month, setMonth] = useState(filters.month.toString());
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);

  const applyFilters = (newYear: number, newMonth: string, start = "", end = "") => {
    const params = new URLSearchParams();
    if (start && end) {
      params.set("startDate", start);
      params.set("endDate", end);
    } else {
      params.set("year", newYear.toString());
      params.set("month", newMonth);
    }
    router.push(`/revenue?${params.toString()}`);
  };

  const handlePrevPeriod = () => {
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      const diffTime = Math.abs(e.getTime() - s.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const newS = new Date(s);
      newS.setDate(newS.getDate() - diffDays);
      const newE = new Date(e);
      newE.setDate(newE.getDate() - diffDays);
      
      const startStr = newS.toISOString().split("T")[0] || "";
      const endStr = newE.toISOString().split("T")[0] || "";
      setStartDate(startStr);
      setEndDate(endStr);
      applyFilters(year, month, startStr, endStr);
    } else if (month === "all") {
      const newYear = year - 1;
      setYear(newYear);
      applyFilters(newYear, "all");
    } else {
      let m = parseInt(month);
      let y = year;
      if (m === 1) {
        m = 12;
        y -= 1;
      } else {
        m -= 1;
      }
      setYear(y);
      setMonth(m.toString());
      applyFilters(y, m.toString());
    }
  };

  const handleNextPeriod = () => {
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      const diffTime = Math.abs(e.getTime() - s.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const newS = new Date(s);
      newS.setDate(newS.getDate() + diffDays);
      const newE = new Date(e);
      newE.setDate(newE.getDate() + diffDays);

      const startStr = newS.toISOString().split("T")[0] || "";
      const endStr = newE.toISOString().split("T")[0] || "";
      setStartDate(startStr);
      setEndDate(endStr);
      applyFilters(year, month, startStr, endStr);
    } else if (month === "all") {
      const newYear = year + 1;
      setYear(newYear);
      applyFilters(newYear, "all");
    } else {
      let m = parseInt(month);
      let y = year;
      if (m === 12) {
        m = 1;
        y += 1;
      } else {
        m += 1;
      }
      setYear(y);
      setMonth(m.toString());
      applyFilters(y, m.toString());
    }
  };

  const handleReset = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth((now.getMonth() + 1).toString());
    setStartDate("");
    setEndDate("");
    router.push("/revenue");
  };

  // CSV Exporter
  const handleExportCSV = () => {
    const headers = [
      "Date",
      "Order Number",
      "Customer",
      "Status",
      "Order Total ($)",
      "Amount Paid ($)",
      "Outstanding Balance ($)",
      "Estimated Cost ($)",
      "Estimated Profit ($)"
    ];

    const rangeLabel = startDate && endDate ? `${startDate} to ${endDate}` : `${month === "all" ? "Year" : "Month"} ${month === "all" ? "" : month + "/"} ${year}`;
    const rows = csvOrders.map((o) => [
      o.date,
      o.orderNumber,
      `"${o.customerName.replace(/"/g, '""')}"`,
      o.status,
      o.total.toFixed(2),
      o.paid.toFixed(2),
      o.due.toFixed(2),
      o.cost.toFixed(2),
      o.profit.toFixed(2)
    ]);

    const csvContent = [
      `"Report Period: ${rangeLabel}"`,
      "",
      headers.join(","),
      ...rows.map((e) => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `printx_revenue_report_${rangeLabel.replace(/[\s/:]+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to render responsive SVG bar charts
  const renderRevenueChart = () => {
    const maxVal = Math.max(...chartData.map((d) => Math.max(d.orderRevenue, d.collectedRevenue, d.profit, 50)));
    const padding = 30;
    const chartHeight = 200;
    const chartWidth = 700;

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} className="w-full min-w-[600px] h-[240px]">
          {/* Y Axis helper grids */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const y = chartHeight - p * (chartHeight - padding) + padding - 20;
            const textVal = Math.round(p * maxVal);
            return (
              <g key={i}>
                <line x1="50" y1={y} x2={chartWidth - 20} y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                <text x="10" y={y + 4} fill="#64748b" className="text-[10px] font-mono">${textVal.toLocaleString("en-US")}</text>
              </g>
            );
          })}

          {/* Draw Bars */}
          {chartData.map((d, index) => {
            const w = (chartWidth - 70) / chartData.length;
            const gap = w * 0.15;
            const x = 50 + index * w;
            const barW = (w - gap * 2) / 2;

            const orderH = ((d.orderRevenue / maxVal) * (chartHeight - padding));
            const orderY = chartHeight - orderH + padding - 20;

            const collectedH = ((d.collectedRevenue / maxVal) * (chartHeight - padding));
            const collectedY = chartHeight - collectedH + padding - 20;

            return (
              <g key={index} className="group">
                {/* Order Revenue Bar (Blue) */}
                {d.orderRevenue > 0 && (
                  <rect
                    x={x + gap}
                    y={orderY}
                    width={barW}
                    height={orderH}
                    fill="#3b82f6"
                    className="opacity-80 hover:opacity-100 transition duration-150"
                    rx="2"
                  >
                    <title>{`Order: ${formatUSD(d.orderRevenue)}`}</title>
                  </rect>
                )}
                {/* Collected Revenue Bar (Emerald/Green) */}
                {d.collectedRevenue > 0 && (
                  <rect
                    x={x + gap + barW + 2}
                    y={collectedY}
                    width={barW}
                    height={collectedH}
                    fill="#10b981"
                    className="opacity-80 hover:opacity-100 transition duration-150"
                    rx="2"
                  >
                    <title>{`Collected: ${formatUSD(d.collectedRevenue)}`}</title>
                  </rect>
                )}

                {/* X-axis Label */}
                {chartData.length <= 12 || index % 2 === 0 ? (
                  <text
                    x={x + w / 2}
                    y={chartHeight + 18}
                    fill="#64748b"
                    textAnchor="middle"
                    className="text-[9px] font-mono"
                  >
                    {d.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  // Helper to render responsive Line Chart (Revenue vs Profit)
  const renderProfitLineChart = () => {
    const maxVal = Math.max(...chartData.map((d) => Math.max(d.orderRevenue, d.profit, 50)));
    const padding = 30;
    const chartHeight = 200;
    const chartWidth = 700;

    const getPointsPath = (key: "orderRevenue" | "profit") => {
      if (chartData.length === 0) return "";
      const w = (chartWidth - 70) / chartData.length;
      return chartData.map((d, index) => {
        const x = 50 + index * w + w / 2;
        const val = d[key];
        const h = (val / maxVal) * (chartHeight - padding);
        const y = chartHeight - h + padding - 20;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ");
    };

    const revPath = getPointsPath("orderRevenue");
    const profitPath = getPointsPath("profit");

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} className="w-full min-w-[600px] h-[240px]">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const y = chartHeight - p * (chartHeight - padding) + padding - 20;
            const textVal = Math.round(p * maxVal);
            return (
              <g key={i}>
                <line x1="50" y1={y} x2={chartWidth - 20} y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                <text x="10" y={y + 4} fill="#64748b" className="text-[10px] font-mono">${textVal.toLocaleString("en-US")}</text>
              </g>
            );
          })}

          {/* Revenue Line (Blue) */}
          {revPath && (
            <>
              <path d={revPath} fill="none" stroke="#3b82f6" strokeWidth="3" className="opacity-95" />
              {/* Draw Points */}
              {chartData.map((d, idx) => {
                const w = (chartWidth - 70) / chartData.length;
                const x = 50 + idx * w + w / 2;
                const h = (d.orderRevenue / maxVal) * (chartHeight - padding);
                const y = chartHeight - h + padding - 20;
                return (
                  <circle key={idx} cx={x} cy={y} r="4" fill="#3b82f6" stroke="#0f172a" strokeWidth="2">
                    <title>{`Order Revenue: ${formatUSD(d.orderRevenue)}`}</title>
                  </circle>
                );
              })}
            </>
          )}

          {/* Profit Line (Emerald) */}
          {profitPath && (
            <>
              <path d={profitPath} fill="none" stroke="#10b981" strokeWidth="3" className="opacity-95" />
              {/* Draw Points */}
              {chartData.map((d, idx) => {
                const w = (chartWidth - 70) / chartData.length;
                const x = 50 + idx * w + w / 2;
                const h = (d.profit / maxVal) * (chartHeight - padding);
                const y = chartHeight - h + padding - 20;
                return (
                  <circle key={idx} cx={x} cy={y} r="4" fill="#10b981" stroke="#0f172a" strokeWidth="2">
                    <title>{`Profit: ${formatUSD(d.profit)}`}</title>
                  </circle>
                );
              })}
            </>
          )}

          {/* X axis labels */}
          {chartData.map((d, index) => {
            const w = (chartWidth - 70) / chartData.length;
            const x = 50 + index * w + w / 2;
            if (chartData.length <= 12 || index % 2 === 0) {
              return (
                <text key={index} x={x} y={chartHeight + 18} fill="#64748b" textAnchor="middle" className="text-[9px] font-mono">
                  {d.label}
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>
    );
  };

  // Helper to render responsive status donut
  const renderStatusDonut = () => {
    const totalCount = statusBreakdown.reduce((sum, item) => sum + item.count, 0);
    if (totalCount === 0) {
      return <div className="text-xs text-slate-500 italic py-12 text-center">No orders in selected range.</div>;
    }

    const radius = 60;
    const strokeWidth = 14;
    const circ = 2 * Math.PI * radius;
    let accumulatedPercent = 0;

    const colors = [
      "#10b981", // Completed (Emerald)
      "#3b82f6", // In production (Blue)
      "#a855f7", // Approved (Purple)
      "#ef4444", // Cancelled (Red)
      "#f59e0b", // Awaiting Approval/Files (Amber)
      "#64748b"  // Other
    ];

    return (
      <div className="flex flex-col items-center justify-center p-4">
        <div className="relative h-[160px] w-[160px] flex items-center justify-center">
          <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
            {statusBreakdown.map((item, i) => {
              const percent = item.count / totalCount;
              const strokeLength = percent * circ;
              const strokeOffset = circ - (accumulatedPercent * circ);
              accumulatedPercent += percent;
              const color = colors[i % colors.length];

              return (
                <circle
                  key={item.status}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="transparent"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${strokeLength} ${circ - strokeLength}`}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              );
            })}
          </svg>
          <div className="absolute text-center">
            <span className="text-xl font-bold text-slate-50">{totalCount}</span>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5">Orders</p>
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-2.5 w-full mt-4 text-[11px]">
          {statusBreakdown.map((item, i) => {
            const color = colors[i % colors.length];
            return (
              <div key={item.status} className="flex items-center gap-1.5 min-w-0">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-slate-400 truncate flex-1">{item.status}</span>
                <span className="font-bold text-slate-200 shrink-0">{item.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters & Actions Panel */}
      <section className="flex flex-wrap items-center justify-between gap-4 border border-slate-800 bg-[#1e293b] p-4 rounded-2xl shadow-sm">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 border border-slate-800 bg-[#0f172a] rounded-xl p-1">
            <button
              onClick={handlePrevPeriod}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
              title="Previous Period"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-slate-300 font-bold px-2 select-none">
              {startDate && endDate
                ? `${startDate} ~ ${endDate}`
                : `${month === "all" ? "Full Year" : "Month " + month} [${year}]`}
            </span>
            <button
              onClick={handleNextPeriod}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
              title="Next Period"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setStartDate("");
                setEndDate("");
                applyFilters(year, e.target.value);
              }}
              className="rounded-lg border border-slate-800 bg-[#0f172a] text-xs text-slate-300 py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">Full Year</option>
              {Array.from({ length: 12 }).map((_, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {new Date(0, idx).toLocaleString("en-GB", { month: "long" })}
                </option>
              ))}
            </select>

            <select
              value={year}
              onChange={(e) => {
                const y = parseInt(e.target.value);
                setYear(y);
                setStartDate("");
                setEndDate("");
                applyFilters(y, month);
              }}
              className="rounded-lg border border-slate-800 bg-[#0f172a] text-xs text-slate-300 py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Date Inputs */}
          <div className="flex items-center gap-2 border border-slate-800 bg-[#0f172a]/50 px-3 py-1 rounded-lg">
            <Calendar size={13} className="text-slate-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value && endDate) {
                  applyFilters(year, month, e.target.value, endDate);
                }
              }}
              className="bg-transparent border-none text-xs text-slate-400 py-0.5 outline-none"
            />
            <span className="text-[10px] text-slate-600 font-bold uppercase">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (startDate && e.target.value) {
                  applyFilters(year, month, startDate, e.target.value);
                }
              }}
              className="bg-transparent border-none text-xs text-slate-400 py-0.5 outline-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 border border-slate-800 bg-[#0f172a] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition"
            title="Reset Filters"
          >
            <RefreshCw size={13} />
            Reset
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </section>

      {/* KPI Row (6 cards) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <article className="rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <TrendingUp size={18} />
          </span>
          <p className="mt-4 text-xl font-bold text-slate-50">
          {formatUSD(stats.revenueToday)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Revenue Today</p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Coins size={18} />
          </span>
          <p className="mt-4 text-xl font-bold text-emerald-400">
            {formatUSD(stats.revenueThisMonth)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Revenue This Month</p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
            <DollarSign size={18} />
          </span>
          <p className="mt-4 text-xl font-bold text-slate-50">
            {formatUSD(stats.outstandingBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Outstanding Bal.</p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Briefcase size={18} />
          </span>
          <p className="mt-4 text-xl font-bold text-slate-50">
            {formatUSD(stats.revenueThisYear)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Revenue This Year</p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
            <TrendingUp size={18} />
          </span>
          <p className="mt-4 text-xl font-bold text-purple-400">
            {formatUSD(stats.estimatedProfit)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Estimated Profit</p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-500/10 text-slate-400">
            <Briefcase size={18} />
          </span>
          <p className="mt-4 text-xl font-bold text-slate-50">{formatUSD(stats.averageOrderValue)}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Average Order Value</p>
        </article>
      </section>

      {/* Yearly revenue helper stats card */}
      <section className="bg-gradient-to-r from-emerald-950/20 via-[#1e293b] to-slate-900/10 border border-slate-800 rounded-2xl p-4 flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-400">Total Order Revenue for Year {year}:</span>
        <span className="font-bold text-slate-100 text-sm">
          {formatUSD(stats.revenueThisYear)}
        </span>
      </section>

      {/* Row 2: Charts (2/3 width) and Status Breakdown Donut (1/3 width) */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="font-semibold text-sm text-slate-200">Revenue Flow Analysis</h3>
            <div className="flex gap-4 text-[10px] font-mono select-none">
              <span className="flex items-center gap-1 text-[#3b82f6]">
                <span className="h-2.5 w-2.5 bg-[#3b82f6] rounded shrink-0" />
                Order Revenue
              </span>
              <span className="flex items-center gap-1 text-[#10b981]">
                <span className="h-2.5 w-2.5 bg-[#10b981] rounded shrink-0" />
                Collected Revenue
              </span>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-slate-500 italic text-xs">
              No revenue records for this period.
            </div>
          ) : (
            renderRevenueChart()
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm">
          <h3 className="font-semibold text-sm text-slate-200 border-b border-slate-800 pb-3">Order Status Pipeline</h3>
          {renderStatusDonut()}
        </div>
      </section>

      {/* Row 3: Line Chart (Revenue vs Estimated Profit) */}
      <section className="rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-semibold text-sm text-slate-200">Profitability Margin Curve</h3>
          <div className="flex gap-4 text-[10px] font-mono select-none">
            <span className="flex items-center gap-1 text-[#3b82f6]">
              <span className="h-2.5 w-2.5 bg-[#3b82f6] rounded-full shrink-0" />
              Order Revenue
            </span>
            <span className="flex items-center gap-1 text-[#10b981]">
              <span className="h-2.5 w-2.5 bg-[#10b981] rounded-full shrink-0" />
              Estimated Profit
            </span>
          </div>
        </div>
        {chartData.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-slate-500 italic text-xs">
            No profitability curve records.
          </div>
        ) : (
          renderProfitLineChart()
        )}
      </section>

      {/* Row 4: Tables (Top Products & Top Customers) */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* Top Products */}
        <div className="rounded-2xl border border-slate-800 bg-[#1e293b] shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4 bg-slate-900/30">
            <h3 className="font-semibold text-sm text-slate-200">Top Products by Revenue</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            {products.length === 0 ? (
              <div className="text-center text-slate-500 italic py-12 text-xs">No products sold in this period.</div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/50 font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3">Product Name</th>
                    <th className="px-4 py-3 text-right">Units Sold</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-5 py-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {products.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/20 transition">
                      <td className="px-5 py-3 font-semibold text-slate-200">{p.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{p.unitsSold}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatUSD(p.revenue)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{formatUSD(p.cost)}</td>
                      <td className="px-5 py-3 text-right font-bold text-emerald-400">{formatUSD(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top Customers */}
        <div className="rounded-2xl border border-slate-800 bg-[#1e293b] shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4 bg-slate-900/30">
            <h3 className="font-semibold text-sm text-slate-200">Top Customers</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            {customers.length === 0 ? (
              <div className="text-center text-slate-500 italic py-12 text-xs">No client transactions in this period.</div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/50 font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                    <th className="px-5 py-3 text-right">Unpaid Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {customers.map((c, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/20 transition">
                      <td className="px-5 py-3 font-semibold text-slate-200">{c.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.ordersCount}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatUSD(c.revenue)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{formatUSD(c.paid)}</td>
                      <td className={`px-5 py-3 text-right font-bold ${c.due > 0 ? "text-red-400" : "text-slate-500"}`}>
                        {formatUSD(c.due)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* Row 5: Recent Payments */}
      <section className="rounded-2xl border border-slate-800 bg-[#1e293b] shadow-sm overflow-hidden flex flex-col">
        <div className="border-b border-slate-800 px-6 py-4 bg-slate-900/30">
          <h3 className="font-semibold text-sm text-slate-200">Recent Payments Log</h3>
        </div>
        <div className="overflow-x-auto">
          {payments.length === 0 ? (
            <div className="text-center text-slate-500 italic py-12 text-xs">No payments logged in this period.</div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900/50 font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Date Received</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Order Ref</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/20 transition">
                    <td className="px-5 py-3 text-slate-400">{p.date}</td>
                    <td className="px-4 py-3 font-semibold text-slate-200">{p.customerName}</td>
                    <td className="px-4 py-3 font-mono text-[10px] font-bold text-slate-400">{p.orderNumber}</td>
                    <td className="px-4 py-3 font-medium text-slate-400 capitalize">{p.method}</td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-400">{formatUSD(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
