import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Validation-status badge with the canonical enum's semantics (never "promoted"). */
export function ValidationBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, string> = {
    VALIDATED: "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    SUGGESTED: "border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    FLAGGED: "border-rose-300 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    REJECTED: "border-rose-300 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px]", map[status])}>
      {status}
    </Badge>
  );
}

/** Provenance-tier badge — AI_SUGGESTED is never displayed as truth. */
export function ProvenanceBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  const map: Record<string, string> = {
    RULE_DERIVED: "border-sky-300 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    AI_SUGGESTED: "border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    HUMAN_VALIDATED: "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    DEMO_DERIVED: "border-violet-300 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    SIMULATED: "border-fuchsia-300 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px]", map[tier])}>
      {tier}
    </Badge>
  );
}

/** Canonical spec-point anchor chip (e.g. 4CH1-1.25). */
export function SpecChip({ code }: { code: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
      {code}
    </code>
  );
}

/** Persistent banner for simulated (non-governed) surfaces. */
export function SimulatedBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-fuchsia-300 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-900 dark:text-fuchsia-200">
      <Badge variant="outline" className="shrink-0 border-fuchsia-400 text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
        SIMULATED
      </Badge>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
