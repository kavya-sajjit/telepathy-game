import type { Metadata, Viewport } from "next";
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "@fontsource/vt323/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telepathy — finish the word, match your friend",
  description: "A two-to-six player word game. Everyone sees half a word. Type the same ending as your friends.",
};

export const viewport: Viewport = {
  themeColor: "#1c1433",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
