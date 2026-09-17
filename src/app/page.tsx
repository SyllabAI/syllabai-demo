import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  FlaskConical,
  Network,
  ScrollText,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDataProvider } from "@/lib/data";
import { publicConfig } from "@/lib/config";
import { ProvenanceBadge } from "@/components/provenance";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const provider = getDataProvider();
  const cfg = publicConfig();
  const [manifest, graph, notes, topics] = await Promise.all([
    provider.manifest(),
    provider.conceptGraph(),
    provider.revisionNotes(),
    provider.examQuestionTopics(),
  ]);
  const questionCount = topics.reduce((a, t) => a + t.questions.length, 0);

  const surfaces = [
    {
      href: "/knowledge-graph",
      icon: Network,
      title: "Knowledge Graph",
      desc: "Official spec anchor + the T-C11 concept web (provenance-shown). Graph → resource → question navigation.",
    },
    {
      href: "/revision-notes",
      icon: BookOpen,
      title: "Revision Notes",
      desc: "The real SME corpus reader with spec-point anchors and source provenance.",
    },
    {
      href: "/exam-questions",
      icon: ScrollText,
      title: "Exam Questions",
      desc: `${questionCount} real exam questions with parts, command words and mark-scheme reveal.`,
    },
    {
      href: "/flashcards",
      icon: CircleHelp,
      title: "Flashcards",
      desc: "DEMO_DERIVED cards generated from the notes — an example of fast, disposable experiments.",
    },
    {
      href: "/practice",
      icon: Zap,
      title: "Practice",
      desc: "Part-level practice player with confidence/self-doubt telemetry feeding the SIMULATED overlay.",
    },
    {
      href: "/tutor",
      icon: Sparkles,
      title: "Tutor",
      desc: "Grounded AI tutor with numbered citations + honest refusals when evidence is thin.",
    },
    {
      href: "/learner",
      icon: User,
      title: "Learner Overlay",
      desc: "Simulated BKT-style state over curriculum truth — clearly separated from canonical data.",
    },
    {
      href: "/experiments",
      icon: FlaskConical,
      title: "Experiments",
      desc: "Isolated, deletable prototypes. Add yours in minutes — see docs/EXPERIMENTS.md.",
    },
  ];

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[11px]">
            {provider.displayName}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            ai: {cfg.aiProviderId}
          </Badge>
          {cfg.neonConfigured && (
            <Badge variant="outline" className="font-mono text-[11px]">
              neon ✓
            </Badge>
          )}
          {cfg.coreConfigured && (
            <Badge variant="outline" className="font-mono text-[11px]">
              core-api ✓
            </Badge>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          A fast experimental shell{" "}
          <span className="text-muted-foreground">around</span> SyllabAI
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          This is <span className="font-medium text-foreground">not</span> a second production
          frontend. It is the disposable playground where learning-surface ideas get tested in
          hours against <span className="font-medium text-foreground">real</span> SyllabAI content —
          then promoted into production architecture only if the evidence supports it. The
          provider badges above show where data and AI come from; swap both via env vars without
          touching a component.
        </p>
      </section>

      {/* corpus stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Curriculum nodes", value: manifest.counts.curriculumNodes },
          { label: "Graph nodes (T-C11)", value: manifest.counts.graphNodes },
          { label: "Revision notes", value: manifest.counts.notes },
          { label: "Exam questions", value: manifest.counts.questions },
        ].map((s) => (
          <Card key={s.label} className="py-4">
            <CardContent className="px-4">
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* surfaces */}
      <section aria-label="Demo surfaces">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {surfaces.map((s) => (
            <Link key={s.href} href={s.href} className="group focus-visible:outline-none">
              <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <s.icon className="size-4 text-primary" aria-hidden />
                    {s.title}
                    <ArrowRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">{s.desc}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* provenance panel */}
      <section aria-label="Content provenance">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              What is real in this demo
            </CardTitle>
            <CardDescription>
              Bundle: {manifest.importSource.repo}@{manifest.importSource.ref} ·{" "}
              {manifest.curriculum.board} {manifest.curriculum.level} {manifest.curriculum.subject}{" "}
              ({manifest.curriculum.code}, {manifest.curriculum.syllabusVersion})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge tier="RULE_DERIVED" />
              <span className="text-muted-foreground">
                specification skeleton + prerequisites — operator-governed graph-as-code
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge tier="AI_SUGGESTED" />
              <span className="text-muted-foreground">
                T-C11 concepts & semantic edges — shown with provenance, never silently promoted
              </span>
            </div>
            <div className="flex-wrap items-center gap-2 sm:flex">
              <ProvenanceBadge tier="DEMO_DERIVED" />
              <span className="text-muted-foreground">
                flashcards generated for the demo — disposable by design
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge tier="SIMULATED" />
              <span className="text-muted-foreground">
                learner overlay — deterministic fiction, never a governed model
              </span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              {manifest.license}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
