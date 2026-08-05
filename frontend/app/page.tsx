// frontend/app/page.tsx
"use client";

import { useState, useEffect } from "react";

export default function DashboardPage() {
  const [status, setStatus] = useState<"Connecting..." | "Online" | "Offline">("Connecting...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/")
      .then((res) => (res.ok ? setStatus("Online") : setStatus("Offline")))
      .catch(() => setStatus("Offline"));
  }, []);

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">System Dashboard</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">Real-time room analytics and game server state</p>
        </div>
        
        {/* Status Badge */}
        <div className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
          <span className={`h-2.5 w-2.5 rounded-full ${status === "Online" ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">{status}</span>
        </div>
      </div>

      {/* Responsive Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Card 1 */}
        <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all shadow-sm">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Active Rooms</h3>
          <p className="text-3xl font-black text-white mt-2">12</p>
          <span className="inline-block mt-2 text-xs text-emerald-400 font-medium">+3 vs last hour</span>
        </div>

        {/* Card 2 */}
        <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all shadow-sm">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Matches</h3>
          <p className="text-3xl font-black text-white mt-2">148</p>
          <span className="inline-block mt-2 text-xs text-purple-400 font-medium">89% telepathy accuracy</span>
        </div>

        {/* Card 3 (Takes 2 cols on tablet, 1 on desktop) */}
        <div className="bg-slate-800/60 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all shadow-sm col-span-1 sm:col-span-2 lg:col-span-1">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">FastAPI Endpoint</h3>
          <p className="text-sm font-mono text-slate-300 mt-2 truncate">http://127.0.0.1:8000</p>
          <span className="inline-block mt-2 text-xs text-slate-400 font-medium">WebSockets ready</span>
        </div>
      </div>
    </div>
  );
}