"use client";

import Link from "next/link";

export default function GameSubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Game Sidebar Boundary */}
      <aside className="w-full md:w-56 border border-black p-4 flex flex-col justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2">
            Navigation
          </h2>
          <nav className="mt-4 space-y-2 text-sm">
            <Link href="/game" className="block hover:underline">
              Lobby around mg
            </Link>
            <Link href="/game/room-1" className="block hover:underline">
              Cave 1
            </Link>
            <Link href="/game/room-2" className="block hover:underline">
              Cave 2
            </Link>
          </nav>
        </div>
        <div className="mt-6 pt-2 border-t border-black text-xs text-slate-600">
          State safely preserved in da shadows.
        </div>
      </aside>

      {/* Main Dynamic View */}
      <section className="flex-1 border border-black p-6">
        {children}
      </section>
    </div>
  );
}