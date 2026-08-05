import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telepathy Game",
  description: "Real-time Telepathy Game Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-black font-mono min-h-screen flex flex-col p-4 sm:p-8">
        {/* Minimal Header */}
        <header className="border-b border-black pb-4 mb-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <Link href="/" className="text-xl font-bold tracking-tight hover:underline">
              TELEPATHY GAME !!
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline">
                Dashboard
              </Link>
              <Link href="/game" className="hover:underline font-bold">
                Lobby
              </Link>
            </nav>
          </div>
        </header>

        {/* Dynamic Page Boundary */}
        <main className="flex-1 max-w-4xl w-full mx-auto">
          {children}
        </main>

        {/* Minimal Footer */}
        <footer className="border-t border-black pt-4 mt-8 text-center text-xs text-slate-600">
          Next.js App Router + FastAPI Backend
        </footer>
      </body>
    </html>
  );
}