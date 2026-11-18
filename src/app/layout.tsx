import type { Metadata, Viewport } from "next";
import "@fontsource/marcellus/400.css";
import { ACCOUNT_MARKER_SCRIPT } from "@/lib/account-marker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Missile Mafia Crafting",
  description:
    "What Missile Mafia's crafters can make in World of Warcraft: Forever, with in-game tooltips and the materials each item needs.",
};

export const viewport: Viewport = {
  themeColor: "#0a0605",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script below marks the page before it is painted, which React must not mistake for a mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCOUNT_MARKER_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
