"use client";

/**
 * AppShell — global chrome, SaveMyExams-style (research §4, flow crawl
 * 2026-09-19): a single header (logo · "Study tools" menu · data-mode
 * badges) and NO global sidebar. SME keeps all global navigation in the
 * header; course surfaces add exactly one course sidebar (course-shell) and
 * resource detail pages add the topic panel (resource-panel). Demo-discipline
 * disclosures and provider badges live in the footer, out of the learner's
 * reading path.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Atom,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  CircleHelp,
  Database,
  FileQuestion,
  FlaskConical,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Network,
  Sparkles,
  User,
  Waypoints,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { clearIdentity, useIdentity } from "@/lib/identity";
import { cn } from "@/lib/utils";
import type { PublicConfig } from "@/lib/config";

const TOOLS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "My subjects" },
  { href: "/courses", label: "Courses", icon: GraduationCap, desc: "All Learning Hubs" },
  { href: "/revision-notes", label: "Revision Notes", icon: BookOpen },
  { href: "/exam-questions", label: "Exam Questions", icon: FileQuestion },
  { href: "/flashcards", label: "Flashcards", icon: CircleHelp },
] as const;

const DEMO_TOOLS = [
  { href: "/tutor", label: "AI Tutor", icon: Sparkles },
  { href: "/practice", label: "Practice", icon: Zap },
  { href: "/knowledge-graph", label: "Knowledge Graph", icon: Network },
  { href: "/graph-explorer", label: "Graph Explorer (OpenHuman)", icon: Waypoints },
  { href: "/learner", label: "Learner Overlay", icon: User },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
] as const;

export function AppShell({
  children,
  config,
}: {
  children: React.ReactNode;
  config: PublicConfig;
}) {
  const pathname = usePathname();
  const identity = useIdentity();
  // course pages manage their own horizontal rhythm (course shell + resource
  // panel); the graph surfaces are full-bleed (the visualizer canvas wants
  // the whole viewport); every other page gets the centred content column
  const inCourse = pathname.startsWith("/courses/");
  const inExplorer =
    pathname.startsWith("/graph-explorer") || pathname.startsWith("/knowledge-graph");

  return (
    <div className="min-h-screen bg-background">
      {/* solid header (SME parity): a translucent bar lets large H1 text bleed
          through on scroll and reads as a rendering glitch (UX audit 2026-09-19) */}
      <header className="sticky top-0 z-40 border-b bg-background print:hidden">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Atom className="size-4" aria-hidden />
            </span>
            <span className="font-display font-semibold tracking-tight">
              syllabai<span className="text-muted-foreground">-demo</span>
            </span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Layers className="size-4 lg:hidden" aria-hidden />
              <span className="hidden lg:inline">Study tools</span>
              <span className="lg:hidden">Menu</span>
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Study tools</DropdownMenuLabel>
              {TOOLS.map((t) => (
                <DropdownMenuItem key={t.href} asChild>
                  <Link href={t.href} className="cursor-pointer">
                    <t.icon className="size-4" aria-hidden />
                    <span className="flex-1">{t.label}</span>
                    {"desc" in t && t.desc && (
                      <span className="text-[11px] text-muted-foreground">{t.desc}</span>
                    )}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Demo prototypes</DropdownMenuLabel>
              {DEMO_TOOLS.map((t) => (
                <DropdownMenuItem key={t.href} asChild>
                  <Link href={t.href} className="cursor-pointer">
                    <t.icon className="size-4" aria-hidden />
                    <span className="flex-1">{t.label}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="ml-1 hidden text-xs text-muted-foreground xl:inline">
            experimental playground · 4CH1 pilot corpus
          </span>

          {/* SME header parity: persistent primary CTA (Task 21-b) + mock
              identity (TEACHER-1) + dual-theme toggle */}
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {identity ? (
              <Button
                variant="outline"
                size="sm"
                className="hidden gap-1.5 sm:inline-flex"
                onClick={() => clearIdentity()}
              >
                <LogOut className="size-3.5" aria-hidden />
                Sign out
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
                <Link href="/login">
                  <LogIn className="size-3.5" aria-hidden />
                  Sign in
                </Link>
              </Button>
            )}
            <Button asChild size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link href="/dashboard">
                <Zap className="size-3.5" aria-hidden />
                Start studying
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* content */}
      <main className={cn("min-w-0 flex-1", !inCourse && !inExplorer && "px-4 py-6 sm:px-6 lg:px-8")}>
        {inCourse || inExplorer ? children : <div className="mx-auto w-full max-w-6xl">{children}</div>}
      </main>

      {/* footer — provenance + demo discipline live here, not in the learner path */}
      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-4">
          <ThemeToggle variant="row" />
          <Badge variant="outline" className="gap-1 text-[10px] font-normal">
            <Database className="size-3" aria-hidden />
            {config.dataMode}
          </Badge>
          <Badge variant="outline" className="gap-1 text-[10px] font-normal">
            <BrainCircuit className="size-3" aria-hidden />
            {config.aiProviderId}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            demo discipline: canonical educational truth lives in{" "}
            <span className="font-mono">syllabai-core</span> + the operator corpora; everything
            simulated here is labelled <span className="font-mono">SIMULATED</span>; everything
            AI-suggested keeps its provenance.
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          syllabai-demo — a disposable experimental shell around SyllabAI. Canonical semantics:
          <span className="font-mono"> syllabai/syllabai</span> · content:
          <span className="font-mono"> syllabai-resources</span> (pilot-licensed, SME attestation
          2026-09-17).
        </p>
      </footer>
    </div>
  );
}
