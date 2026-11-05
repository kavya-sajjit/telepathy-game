import type { Metadata, Viewport } from "next";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/pixelify-sans/700.css";
import "@fontsource/atkinson-hyperlegible-next/400.css";
import "@fontsource/atkinson-hyperlegible-next/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telepathy: finish the word, match your friends",
  description: "A word game for 2 to 6 people. Everyone sees half a word. Type the same ending as your friends.",
};

export const viewport: Viewport = {
  themeColor: "#9bb6ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
