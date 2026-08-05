// frontend/app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telepathy Game",
  description: "A real-time telepathy matching game built with Next.js and FastAPI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-slate-100 flex flex-col min-h-screen">
        {/* Reusable Header / Navbar */}
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-2xl">🔮</span>
              <span className="font-bold text-lg sm:text-xl text-white">Telepathy Game</span>
            </Link>
            
            <div className="flex items-center gap-4 text-sm font-medium">
              <Link href="/" className="hover:text-purple-400 transition-colors">
                Dashboard
              </Link>
              <Link href="/game/demo" className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-all text-xs sm:text-sm">
                Play Now
              </Link>
            </div>
          </nav>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>

        {/* Reusable Footer */}
        <footer className="border-t border-slate-800 py-6 text-center text-xs sm:text-sm text-slate-500">
          Built with Next.js, Tailwind CSS & FastAPI
        </footer>
      </body>
    </html>
  );
}