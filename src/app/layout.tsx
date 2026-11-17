import type { Metadata, Viewport } from "next";
import "@fontsource/marcellus/400.css";
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
