import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource/marcellus/400.css";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ACCOUNT_MARKER_SCRIPT } from "@/lib/account-marker";
import { SITE_NAME } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description:
    "The Missile Mafia guild in World of Warcraft: Forever: what its crafters can make, who to ask, and the best gear for your character.",
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
      <body>
        <SiteHeader />
        {/* Pages left by way of a link stay in the document, hidden; the way past the bar leads to this, not to one of them. */}
        <div id="main" tabIndex={-1}>
          {children}
        </div>
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
      </body>
    </html>
  );
}
