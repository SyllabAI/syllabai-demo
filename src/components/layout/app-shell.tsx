"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Atom,
  BookOpen,
  CircleHelp,
  FlaskConical,
  GraduationCap,
  Layers,
  Network,
  ScrollText,
  Sparkles,
  User,
  Menu,
  X,
  Database,
  BrainCircuit,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PublicConfig } from "@/lib/config";

const NAV = [
  { href: "/courses", label: "Courses", icon: GraduationCap },
  { href: "/", label: "Hub", icon: Layers },
  { href: "/knowledge-graph", label: "Knowledge Graph", icon: Network },
  { href: "/revision-notes", label: "Revision Notes", icon: BookOpen },
  { href: "/exam-questions", label: "Exam Questions", icon: ScrollText },
  { href: "/flashcards", label: "Flashcards", icon: CircleHelp },
  { href: "/practice", label: "Practice", icon: Atom },
  { href: "/tutor", label: "Tutor", icon: Sparkles },
  { href: "/learner", label: "Learner Overlay", icon: User },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
];

export function AppShell({
  children,
  config,
}: {
  children: React.ReactNode;
  config: PublicConfig;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const modeBadge = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="gap-1 text-[10px] font-normal">
        <Database className="size-3" aria-hidden />
        {config.dataMode}
      </Badge>
      <Badge variant="outline" className="gap-1 text-[10px] font-normal">
        <BrainCircuit className="size-3" aria-hidden />
        {config.aiProviderId}
      </Badge>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            className="inline-flex size-9 items-center justify-center rounded-md border lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Atom className="size-4" aria-hidden />
            </span>
            <span className="font-semibold tracking-tight">
              syllabai<span className="text-muted-foreground">-demo</span>
            </span>
          </Link>
          <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
            experimental playground · 4CH1 pilot corpus
          </span>
          <div className="ml-auto">{modeBadge}</div>
        </div>
      </header>

      <div className="flex">
        {/* sidebar */}
        <nav
          className={cn(
            "fixed inset-y-14 left-0 z-30 w-60 shrink-0 border-r bg-background p-3 transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Primary"
        >
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Demo discipline</p>
            Canonical educational truth lives in <span className="font-mono">syllabai-core</span> +
            the operator corpora. Everything simulated here is labelled{" "}
            <span className="font-mono">SIMULATED</span>; everything AI-suggested keeps its
            provenance.
          </div>
        </nav>

        {/* content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
          <footer className="mx-auto mt-10 w-full max-w-6xl border-t pt-4 text-xs text-muted-foreground">
            syllabai-demo — a disposable experimental shell around SyllabAI. Canonical semantics:
            <span className="font-mono"> syllabai/syllabai</span> · content:
            <span className="font-mono"> syllabai-resources</span> (pilot-licensed, SME attestation
            2026-09-17).
          </footer>
        </main>
      </div>
    </div>
  );
}
