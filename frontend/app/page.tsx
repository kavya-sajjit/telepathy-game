"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [status, setStatus] = useState<"Connecting..." | "Online" | "Offline">("Connecting...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/")
      .then((res) => (res.ok ? setStatus("Online") : setStatus("Offline")))
      .catch(() => setStatus("Offline"));
  }, []);

  return (
    <div className="space-y-6">
      {/* Title Block */}
      <div className="border border-black p-6">
        <h1 className="text-2xl font-bold tracking-tight uppercase">Reckon you know which room twin is in?</h1>
        <p className="text-xs text-slate-600 mt-1">Room stats</p>
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-black p-4">
          <h3 className="text-xs uppercase font-bold">Backend Stats</h3>
          <p className="text-lg font-bold mt-2">{status}</p>
        </div>

        <div className="border border-black p-4">
          <h3 className="text-xs uppercase font-bold">Active Rooms</h3>
        </div>

        <div className="border border-black p-4">
          <h3 className="text-xs uppercase font-bold">Quick Start</h3>
          <Link href="/game/room-101" className="inline-block text-xs font-bold underline mt-3">
            Enter Room... -&gt;
          </Link>
        </div>
      </div>
    </div>
  );
}