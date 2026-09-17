import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/app-shell";
import { publicConfig } from "@/lib/config";

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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AppShell config={config}>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
