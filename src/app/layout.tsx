import type { Metadata } from "next";
import { Kodchasan, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/app-shell";
import { publicConfig } from "@/lib/config";

/**
 * Typography (Task 21-b, matched to the SaveMyExams reference pages):
 *   Plus Jakarta Sans — body (SME: --font-plus-jakarta-sans)
 *   Kodchasan — display headings (SME's display serif for the logo/H1s)
 * next/font self-hosts both at build time; vars are wired in globals.css.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
const kodchasan = Kodchasan({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-kodchasan",
  display: "swap",
});

export const metadata: Metadata = {
  title: "syllabai-demo — experimental playground",
  description:
    "A fast, disposable experimental shell around SyllabAI: prototype learning surfaces on the real 4CH1 pilot corpus without touching production.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const config = publicConfig();
  return (
    <html lang="en" className={`${jakarta.variable} ${kodchasan.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <AppShell config={config}>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
