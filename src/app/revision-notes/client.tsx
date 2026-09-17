"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ExternalLink } from "lucide-react";
import type { RevisionNote } from "@/lib/contracts";
import { SpecChip } from "@/components/provenance";

export function RevisionNotesIndex({
  notes,
  specFilter,
}: {
  notes: RevisionNote[];
  specFilter: string | null;
}) {
  // group notes by spec-point section prefix (4CH1-<section>.<point>)
  const groups = useMemo(() => {
    const bySection = new Map<string, RevisionNote[]>();
    for (const n of notes) {
      const section = n.specPointCodes[0]?.split(".")[0] ?? "unmapped";
      bySection.set(section, [...(bySection.get(section) ?? []), n]);
    }
    return [...bySection.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const visible = specFilter
    ? notes.filter((n) => n.specPointCodes.includes(specFilter))
    : notes;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BookOpen className="size-5 text-primary" aria-hidden />
          Revision Notes
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The real SME revision-note corpus (pilot-licensed, SME attestation). Canonical{" "}
          <span className="font-mono text-xs">rn_*</span> ids and spec-point mappings are preserved
          exactly as ingested upstream — the demo re-hosts a curated subset for prototyping, it
          does not redefine the corpus.
        </p>
        {specFilter && (
          <p className="mt-2 text-sm">
            Filtered by spec point <SpecChip code={specFilter} />{" "}
            <Link href="/revision-notes" className="ml-1 underline underline-offset-2">
              clear
            </Link>
          </p>
        )}
      </div>

      {specFilter && visible.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No bundled note maps to {specFilter}. The full corpus (39 courses) lives in
            syllabai-resources — this bundle carries a curated 4CH1 subset.
          </CardContent>
        </Card>
      )}

      {groups.map(([section, sectionNotes]) => {
        const list = specFilter ? visible : sectionNotes;
        if (list.length === 0) return null;
        return (
          <section key={section} className="space-y-2" aria-label={`Section ${section}`}>
            <h2 className="font-medium">
              Section {section}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {sectionNotes.length} note{sectionNotes.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((n) => (
                <Link key={n.noteId} href={`/revision-notes/${n.noteId}`} className="group focus-visible:outline-none">
                  <Card className="h-full transition-colors group-hover:border-primary/40">
                    <CardHeader className="pb-1.5">
                      <CardTitle className="text-sm leading-snug">{n.title}</CardTitle>
                      <CardDescription className="flex flex-wrap gap-1 pt-1">
                        {n.specPointCodes.map((c) => (
                          <SpecChip key={c} code={c} />
                        ))}
                        {n.guidedStudy && (
                          <Badge variant="secondary" className="text-[10px]">
                            guided study
                          </Badge>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      <span className="font-mono">{n.noteId}</span>
                      {n.sourceUrl && (
                        <span className="ml-2 inline-flex items-center gap-0.5">
                          <ExternalLink className="size-3" aria-hidden /> source
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
