import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { CookieBanner } from "@/components/cookie-banner";

// Inter — the TL Finance Core typeface.
// variable exposes --font-inter used by tailwind.config.ts fontFamily.sans
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Preload the weights most used in the UI
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: {
    default: "TL Finance Core",
    template: "%s — TL Finance Core"
  },
  description:
    "Self-hosted multi-currency household budgeting, forecasting, and asset tracking.",
  keywords: ["budget", "finance", "forecasting", "household", "self-hosted"],
  robots: { index: false, follow: false }
};

// Avoid the white flash before the theme provider hydrates.
// Defaults to dark (brand-first) when no preference is stored.
const themeBootstrap = `
  (function() {
    try {
      var v = localStorage.getItem('tlfc.theme') || 'dark';
      var dark = v === 'dark' || (v === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
