# Open Notebook — "Quiet Green" Design System

> **The complete design language of the Open Notebook frontend** (Next.js app deployed on Vercel), extracted from source so it can be applied to *any* website.
> Canonical token source: `frontend/src/app/globals.css` · Living styleguide: `/dev/design` (dev builds only) · Extracted: 2026-09-22 from `lfnovo/open-notebook` v1.14 (`vercel-deploy` branch).

---

## Table of Contents

1. [Design Philosophy — The Laws](#1-design-philosophy--the-laws)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Shape — Radius, Borders, Hairlines](#5-shape--radius-borders-hairlines)
6. [Depth — Shadows](#6-depth--shadows)
7. [Motion](#7-motion)
8. [Iconography](#8-iconography)
9. [Dark Mode Architecture](#9-dark-mode-architecture)
10. [Component Specifications](#10-component-specifications)
11. [Layout System](#11-layout-system)
12. [Application Patterns](#12-application-patterns)
13. [Accessibility](#13-accessibility)
14. [Do & Don't](#14-do--dont)
15. [Porting Guide — Apply to Any Website](#15-porting-guide--apply-to-any-website)
16. [Appendix — Complete Copy-Paste CSS](#16-appendix--complete-copy-paste-css)

---

## 1. Design Philosophy — The Laws

The theme is called **"Quiet Green"**. It is a *content-first, low-chrome, editorial-utility* system: the interface recedes so reading material dominates. Everything follows one breath of laws, stated in the source itself:

> **fern acts · teal speaks (AI/system voice) · red destroys, and only destroys**
> **warn is clay, never the action hues · color never washes a reading surface**
> **hairline borders, near-zero shadows — popovers own the one real shadow**
> **geometry is squared, 4–6px, floor is 4 · mono is for data, not prose**

Unpacked into operational rules:

| # | Law | Practical meaning |
|---|-----|-------------------|
| 1 | **Fern acts** | Green (`--fern`) is the *only* action color — primary buttons, active-tab spines, checked states, "success/completed". Never use it decoratively. |
| 2 | **Teal speaks** | Teal (`--teal`) is the voice of AI/system-generated content: insights, embeddings, processing states, AI badges, focus rings. If the machine "said" it, it may wear teal. |
| 3 | **Red destroys, and only destroys** | Red (`--danger`) appears *exclusively* on delete/destructive/error. Never for warnings, never for branding, never for "attention". |
| 4 | **Warn is clay** | Warnings use the muted brick `--clay`, not red and not the action hues. Degraded states too. |
| 5 | **Color never washes a reading surface** | Long-form text sits on neutral surfaces only. Tinted backgrounds are reserved for micro-elements (chips, badges, dots, one sanctioned excerpt wash). |
| 6 | **Hairlines separate, not shadows** | Cards/panels/blocks are divided by 1px borders (`--line`). Shadows are nearly absent from static layout. |
| 7 | **Popovers own the one real shadow** | Floating layers (popovers, dropdowns, selects, tooltips) carry `--shadow-pop`. Modals carry `--shadow-overlay`. Nothing else floats. |
| 8 | **Geometry is squared** | Radii range 4–6px (floor is 4px). Nothing is pill-shaped except progress tracks, dots, and full-round avatars/radio. The UI reads as *instrument, not toy*. |
| 9 | **Mono is for data, not prose** | Monospace is for IDs, versions, tokens, code, timestamps, citations, keyboard hints. Never for paragraphs. |
| 10 | **Focus on content, not chrome** | Controls appear on demand (hover-revealed ⋮ menus, collapsible columns, progressive disclosure). Content owns the screen. |

Supporting product principles (from `docs/7-DEVELOPMENT/design-principles.md`): minimize clutter; content occupies most of the screen; progressive disclosure (simple options first, advanced on demand); sensible defaults that work for 80% of use cases; instant feel with loading states for slow operations; graceful degradation.

---

## 2. Tech Stack & Architecture

Understanding the stack matters because every spec below is expressed twice: as **design tokens** (portable to anything) and as **Tailwind v4 + shadcn/ui classes** (direct reuse in React/Tailwind projects).

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 (App Router) + React 19 | `"use client"` components, RSC where possible |
| CSS engine | **Tailwind CSS 4** | Config lives *in CSS* via `@theme inline` — no `tailwind.config.js` |
| Animations | `tw-animate-css` | Provides `animate-in/out`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` |
| Typography plugin | `@tailwindcss/typography` | `.prose` for rendered markdown |
| Component base | **shadcn/ui, "new-york" style** | `components.json`: baseColor `neutral`, cssVariables `true`, icon library `lucide` |
| Primitives | Radix UI (dialog, dropdown, select, tabs, tooltip, popover, checkbox, radio, progress, accordion, collapsible, scroll-area, alert-dialog, label, slot, separator) | Accessibility + behavior; styling fully overridden |
| Variants | `class-variance-authority` (cva) | Variant/size matrices per component |
| Class utility | `cn()` = `clsx` + `tailwind-merge` | The only helper needed for class composition |
| Icons | `lucide-react` | Single icon set, stroke style |
| Toasts | `sonner` | Themed via CSS variables |
| Command palette | `cmdk` | ⌘K palette built on Dialog |
| Markdown | react-markdown + remark-gfm/math + rehype-katex + react-syntax-highlighter (Prism `oneDark`/`oneLight` per theme) | |
| State | zustand (persisted) + TanStack Query | Theme, sidebar, language stored client-side |
| Fonts | next/font/google: Instrument Sans, Bricolage Grotesque, Spline Sans Mono | Self-hosted, no FOUT |

**Architecture of tokens (3 layers — this is the portability trick):**

```
Layer 1  RAW VALUES      :root / .dark        → hex values for hues, surfaces, ink, lines
Layer 2  SEMANTIC ALIASES:root (defined once) → --primary: var(--fern); re-resolve automatically in dark
Layer 3  TAILWIND BRIDGE : @theme inline      → maps vars to utilities (bg-primary, text-ink-soft…)
```

> **Critical rule from the source:** *never duplicate aliases into the `.dark` block.* Only raw values are overridden in dark; every alias defined with `var()` re-resolves on its own. Theme switching works via a `dark` class on `<html>` only (a nested `.dark` wrapper does NOT re-resolve aliases — they inherit already-resolved light values).

---

## 3. Color System

### 3.1 The 9 Owned Hues (core palette)

Each hue ships as `--hue` (base), `--hue-deep` (pressed/emphasis), `--hue-tint` (10–15% wash for chips/badges). Exposed as Tailwind utilities: `bg-fern`, `text-teal`, `border-gold/30`, etc.

| Hue | Role / meaning | Light base | Light deep | Light tint | Dark base | Dark deep | Dark tint |
|-----|----------------|-----------|------------|------------|-----------|-----------|-----------|
| `--fern` | **THE action green** — primary actions, success, active states | `#2e6b4f` | `#245740` | `#dfeae2` | `#55b285` | `#6cc298` | `#1b2f25` |
| `--sage` | Web / gathering (link sources, secondary green) | `#5e7a54` | `#47603f` | `#e5ebdc` | `#93b084` | `#a8c299` | `#232b1d` |
| `--gold` | Notes & PDF (amber) | `#a97b12` | `#7c5a05` | `#f3ead3` | `#cfa13e` | `#ddb55f` | `#322b1b` |
| `--teal` | **AI / system voice** — insights, embeddings, processing, focus ring | `#0e7268` | `#095a51` | `#ddece8` | `#3fb3a5` | `#64c5b9` | `#16302c` |
| `--plum` | Video content | `#5d4991` | — | `#eae6f3` | `#a290d3` | — | `#29253a` |
| `--mauve` | Audio content | `#8d5b80` | `#714566` | `#f1e5ee` | `#c892ba` | `#d6a8cb` | `#322230` |
| `--slate` | Paper / external (blue-gray) | `#4e6b84` | `#3a5468` | `#e1e8ee` | `#8fafc8` | `#a5c1d6` | `#212b34` |
| `--violet` | Derived insight (AI-generated from sources) | `#6e51a6` | `#57408a` | `#ebe5f5` | `#a995db` | `#bcaae6` | `#2b2540` |
| `--clay` | **Warn / degraded** (brick, never red) | `#b0451f` | `#93330f` | `#f5e4db` | `#f08a5c` | `#f5a07a` | `#35211a` |

### 3.2 Surfaces (the neutral ladder)

Six neutral surfaces create depth *without shadows*. Order of elevation: `bg < surface < surface-raised` (raised wins on hover/popovers).

| Token | Meaning | Light | Dark |
|-------|---------|-------|------|
| `--bg` | App canvas behind everything | `#f5f5f2` | `#17181b` |
| `--bg-deep` | Rails, wells, the sidebar | `#eeeee9` | `#121316` |
| `--surface` | **The reading surface** (cards, panels) | `#fefefc` | `#1e2024` |
| `--surface-raised` | Popovers, inputs, hovered cards | `#ffffff` | `#24262b` |
| `--surface-recessed` | Secondary/muted blocks | `#f4f4f0` | `#24262b` |
| `--surface-sunken` | Wells, kbd, accent-hover fills | `#ecece7` | `#2b2d33` |

### 3.3 Ink (text ramp — 4 steps)

| Token | Use | Light | Dark |
|-------|-----|-------|------|
| `--ink` | Primary text | `#23252a` | `#ecedea` |
| `--ink-soft` | Secondary text, descriptions | `#565a61` | `#a9acb1` |
| `--ink-faint` | Metadata, timestamps | `#878b92` | `#74777d` |
| `--ink-faintest` | Disabled text | `#a8abb1` | `#63666c` |

### 3.4 Lines (borders)

| Token | Use | Light | Dark |
|-------|-----|-------|------|
| `--line` | Default hairline border (1px) | `#e0e0da` | `#2e3036` |
| `--line-soft` | Softer dividers | `#e8e8e2` | `#26282d` |
| `--line-strong` | Emphasis border (rare; equals ink) | `#23252a` | `#ecedea` |

### 3.5 Semantic Raws (action & danger)

| Token | Meaning | Light | Dark |
|-------|---------|-------|------|
| `--primary` | Action green (= fern) | `#2e6b4f` | `#3d8e67` |
| `--primary-hover` | Pressed/hover primary | `#245740` | `#479e74` |
| `--on-primary` | Text on primary | `#f1f8f3` | `#ecf7f0` |
| `--danger` | Destruction & failure only | `#b0432d` | `#df7c63` |
| `--danger-deep` | Danger emphasis | `#93341f` | `#e9937d` |
| `--danger-tint` | Danger wash (badges) | `#f5e4df` | `#37231d` |
| `--warn` / `--warn-deep` / `--warn-tint` | Aliases of clay | = clay | = clay |

### 3.6 Sanctioned Washes (the only tinted text backgrounds)

| Token | Use | Light | Dark |
|-------|-----|-------|------|
| `--excerpt-wash` | Cited/quoted passage background — the ONE tinted reading block allowed | `#ecf3f0` | `#1c2a28` |
| `--best-match` | Best-match sentence highlight inside an excerpt (`<mark>`), step stronger than wash | `rgba(14,114,104,0.16)` | `rgba(63,179,165,0.2)` |
| `--best-match-ring` | Ring around best match | same as above | same |

### 3.7 Semantic Aliases — the shadcn contract

These map the design onto the standard shadcn/ui slots so stock components theme themselves. Defined ONCE in `:root` with `var()` — they re-resolve in dark automatically.

| Alias | Resolves to | Alias | Resolves to |
|-------|-------------|-------|-------------|
| `--background` | `--bg` | `--foreground` | `--ink` |
| `--card` / `--card-foreground` | `--surface` / `--ink` | `--popover` / `--popover-foreground` | `--surface-raised` / `--ink` |
| `--primary` / `--primary-foreground` | `--primary` / `--on-primary` | `--primary-hover` | `--primary-hover` |
| `--secondary` / `--secondary-foreground` | `--surface-recessed` / `--ink` | `--muted` / `--muted-foreground` | `--surface-recessed` / `--ink-soft` |
| `--accent` / `--accent-foreground` | `--surface-sunken` / `--ink` | `--destructive` | `--danger` |
| `--border` / `--input` | `--line` / `--line` | `--ring` | `--teal` |
| `--radius` | `5px` | | |
| `--sidebar` | `--bg-deep` | `--sidebar-foreground` | `--ink` |
| `--sidebar-primary` / `--sidebar-primary-foreground` | `--primary` / `--on-primary` | `--sidebar-accent` / `--sidebar-accent-foreground` | `--surface` / `--ink` |
| `--sidebar-border` / `--sidebar-ring` | `--line` / `--teal` | | |
| `--chart-1…5` | fern, teal, gold, plum, slate | | |

> **Hover pattern:** `hover:bg-accent` (surface-sunken) is THE standard hover for ghost buttons, menu items, list rows. Cards raise to `--surface-raised` instead.

### 3.8 Content-Type Hues (dots, ticks, chips — *never washes*)

Semantic color-coding of content kinds. Used as small dots (`size-2 rounded-full`) inside chips, tick marks, or icon tints — **never as large background fills**.

| Content type | Base | Soft (tint) |
|--------------|------|-------------|
| `--type-video` | `--plum` | `--plum-tint` |
| `--type-pdf` | `--gold` | `--gold-tint` |
| `--type-web` | `--sage` | `--sage-tint` |
| `--type-audio` | `--mauve` | `--mauve-tint` |
| `--type-paper` | `--slate` | `--slate-tint` |
| `--type-note` | `--gold` | `--gold-tint` |
| `--type-ai` | `--teal` | `--teal-tint` |
| `--type-insight` | `--teal` | `--teal-tint` |

Canonical chip markup (from the styleguide):

```html
<span class="inline-flex items-center gap-1.5 rounded-sm border bg-popover px-2 py-0.5 text-xs font-medium">
  <span class="size-2 rounded-full" style="background: var(--type-pdf)"></span>
  pdf
</span>
```

### 3.9 Evidence Classes (citations)

Citation chips in AI answers get per-class hues; a dashed chip means *synthesis* (no evidence); `--cite-warn` marks unverified claims.

| Class | Color | Chip style |
|-------|-------|-----------|
| `--cite-source` (deep: `--teal-deep`) | teal | dot + number, solid border |
| `--cite-note` (deep: `--gold-deep`) | gold | dot + number |
| `--cite-derived` (deep: `--violet-deep`) | violet | dot + number |
| `--cite-external` (deep: `--slate-deep`) | slate | dot + number |
| `--cite-synthesis` | `--ink-faint` | **dashed** border, `◦` glyph, transparent bg |
| `--cite-warn` | `--clay` | warn chip |

Citation chip markup: `rounded-sm border bg-popover px-1.5 py-0.5 font-mono text-[10.5px]` with `size-1.5 rounded-full` dot.

### 3.10 Context States (per-source inclusion in AI context)

| State | bg | text |
|-------|----|------|
| FULL (whole source in context) | `--ctx-full-tint` (`--fern-tint`) | `--ctx-full` (`--fern`) |
| INSIGHTS (only insights included) | `--ctx-insights-tint` (`--gold-tint`) | `--ctx-insights` (`--gold`) |
| OFF | `--ctx-off-bg` (`--surface-raised`) | `--ctx-off-ink` (`--ink-soft`) |

Chip markup: `rounded-sm border px-2 py-0.5 text-xs font-medium uppercase`.

### 3.11 Color Usage Quick Rules

- **Reading surfaces are always neutral.** Tinted bg only on: chips/badges, status pills, dots, the excerpt wash.
- **Opacity modifiers** are used for states, e.g. `border-teal/30`, `border-fern/30`, `border-destructive/30` (30% tint borders on status pills), `hover:bg-destructive/10`, `bg-primary/20` (progress track), `text-sidebar-foreground/40…80`.
- **`bg-popover` (surface-raised) is the "chip surface"** — type chips, citation chips, and inputs all sit on it to lift off cards.

---

## 4. Typography

### 4.1 Font Families (3 fonts, strict roles)

| Role | Font | Weights | CSS var | Fallback stack | Rule |
|------|------|---------|---------|----------------|------|
| **Body / UI** (`font-sans`) | Instrument Sans | 400–600 | `--font-instrument-sans` | `"Helvetica Neue", Arial, sans-serif` | Everything default |
| **Display** (`font-display`) | Bricolage Grotesque | 600, 700 only | `--font-bricolage` | `"Avenir Next", "Trebuchet MS", sans-serif` | Page/section titles, app name, primary CTA label. Slightly quirky grotesque — gives personality to otherwise quiet UI |
| **Mono** (`font-mono`) | Spline Sans Mono | 400 | `--font-spline-mono` | `ui-monospace, "SF Mono", Menlo, monospace` | Data only: IDs, versions, tokens, code, timestamps, citations, kbd. **Never prose.** |

Loaded via `next/font/google` with CSS variables on `<body>`:

```tsx
const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans" })
const bricolageGrotesque = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600","700"], variable: "--font-bricolage" })
const splineSansMono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-spline-mono" })
// <body className={`${...variables} font-sans`}>
```

### 4.2 Type Scale (as actually used)

| Element | Classes | Notes |
|---------|---------|-------|
| Page title | `font-display text-2xl font-bold tracking-tight` | Display font is mandatory for page titles |
| Section title | `font-display text-xl font-bold tracking-tight` | |
| Dialog title | `text-lg font-semibold leading-none` | Sans, not display |
| Card title | `font-semibold leading-none` (inherits size ≈ base) | |
| Body / controls | `text-sm` (14px) | Default for UI text |
| Inputs (mobile-first) | `text-base md:text-sm` | Prevents iOS zoom-on-focus |
| Small labels / badges | `text-xs font-medium` | |
| Sidebar item | `text-[13px] font-medium` | |
| App name in sidebar | `font-display text-[15px] font-bold tracking-tight` | |
| Sub-section heading | `text-[15.5px] font-medium` | |
| Sidebar section header | `text-[10.5px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40` | The signature "eyebrow" |
| Micro label | `text-[10px]` (often `uppercase tracking-wider` + `font-semibold text-muted-foreground`) | |
| Metadata / version chips | `font-mono text-[11px]` | |
| Citation chip | `font-mono text-[10.5px]` | |
| kbd shortcut | `font-mono text-[10px] font-medium` | |

**Spacing between type blocks:** `mb-4` paragraphs, `space-y-2/3/4` stacks, headings `mt-10 mb-4` (sections). Line-height: default for UI; `leading-7` for markdown paragraphs; `leading-tight`/`leading-none` on titles.

---

## 5. Shape — Radius, Borders, Hairlines

**Philosophy: geometry is squared — instrument, not toy. Floor is 4px.**

| Token | Value | Applied to |
|-------|-------|-----------|
| `--radius-sm` | **4px** | Chips, small buttons, select/command items, type dots' containers, code inline |
| `--radius-md` / `--radius` / `--radius-lg` | **5px** | Controls, inputs, buttons, cards, dropdown/popover/select content |
| `--radius-xl` | **6px** | Panels, dialogs/overlays — the largest radius in the system |
| `--radius: 5px` | shadcn base | |

Exceptions (allowed full-round): progress track & bar (`rounded-full h-2`), dots (`rounded-full size-2`), radio (round by nature), avatar circles, scrollbar thumb, tooltip arrow (`rounded-[2px]`), checkbox (`rounded-[4px]` — square-ish on purpose), the logo pebbles (`rounded-[3px]`).

**Borders are 1px hairlines everywhere:** `border` (default color `--line`) on every card, input, chip, popover, dialog. Divider `<Separator>` is `h-px bg-border`. Cards separate with these lines — never with shadows. Emphasis via `ring-1 ring-inset ring-border` (sidebar active item) rather than thicker borders.

Special border treatments: `border-dashed` for synthesis chips / dropzones; 30%-alpha tinted borders on status pills (`border-teal/30`); `border-b-2 border-transparent` + active `border-primary` for tab underline.

---

## 6. Depth — Shadows

**Cards separate with hairlines, not shadows; hover raises the surface. Popovers own the one real shadow.**

| Token | Light | Dark | Used by |
|-------|-------|------|---------|
| `--shadow-soft` | `0 1px 2px rgba(35,37,42,0.06)` | `0 1px 2px rgba(0,0,0,0.35)` | Panels, static cards (optional) |
| `--shadow-lift` | `0 1px 3px rgba(35,37,42,0.1)` | `0 1px 3px rgba(0,0,0,0.45)` | **Hover elevation** (`card-hover`) |
| `--shadow-pop` | `0 1px 2px rgba(35,37,42,0.08), 0 8px 26px rgba(35,37,42,0.13)` | `0 1px 2px rgba(0,0,0,0.45), 0 10px 30px rgba(0,0,0,0.5)` | Popovers, dropdowns, selects, tooltips, command menu |
| `--shadow-overlay` | `0 2px 6px rgba(35,37,42,0.1), 0 16px 44px rgba(35,37,42,0.18)` | `0 2px 6px rgba(0,0,0,0.4), 0 20px 52px rgba(0,0,0,0.55)` | Dialogs / modal sheets |

Rule of thumb: if it's anchored in the page → border only. If it floats above the page → `shadow-pop`. If it blocks the page (modal) → `shadow-overlay`.

---

## 7. Motion

**Quick and quiet.** Durations live in variables:

| Token | Value | Used for |
|-------|-------|----------|
| `--motion-fast` | `0.12s` | Micro feedback |
| `--motion-base` | `0.15s` | Standard hover/transition (`transition-colors duration-150` is the workhorse) |
| `--motion-slow` | `0.25s` | Panels, sidebar expand/collapse (`duration-300` in practice) |

Standard motions:
- **Color transitions:** `transition-colors duration-150` (or `transition-all` on buttons) on every interactive element.
- **Overlay enter/exit (tw-animate-css):** `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200` on dialogs; popovers/menus add directional `data-[side=bottom]:slide-in-from-top-2` etc.
- **Spinners:** `animate-spin` on `Loader2`.
- **Theme toggle icon swap:** Sun rotates/scales out, Moon rotates in (`dark:-rotate-90 dark:scale-0` pattern).
- **Accordion:** `animate-accordion-up/down` (height) `duration-200`; chevron `rotate-180` when open.
- **Hover-reveal controls:** `opacity-0 group-hover:opacity-100 transition-opacity` (card ⋮ menus).
- Progress bar: `transition-all duration-300` on width/transform. Sidebar: `transition-all duration-300` on width. Column collapse: `transition-all duration-150`.
- **No** bouncy easing, no long fades, no parallax. If it draws attention to itself, it's too much.

---

## 8. Iconography

- Library: **lucide-react** exclusively (stroke icons, `currentColor`).
- Default control size: `h-4 w-4` (16px) — enforced globally in Button/Tabs/Select/Menu via `[&_svg:not([class*='size-'])]:size-4`.
- Badge icons: `size-3`; status pill icons: `h-3 w-3` (+ `animate-spin` while processing); empty-state icon: `h-12 w-12 text-muted-foreground/60`; collapsed-column icon `h-5 w-5`; menu trigger `h-4 w-4 opacity-50` (select chevron).
- Sidebar nav icons may carry semantic tints: sources `text-sage`, notebooks `text-teal`, podcasts `text-mauve`, all `opacity-85`.
- Icon buttons **always** have `aria-label` (or `sr-only` text).
- Trash2 = delete only; RefreshCw = retry/refresh; MoreVertical = overflow menu; CheckCircle/AlertTriangle/Clock = status trio.

---

## 9. Dark Mode Architecture

**Strategy: class-based on `<html>`, three-state user preference (light / dark / system), zero flash.**

1. **No-flash script** runs before hydration: reads `localStorage['theme-storage']`, applies `light`/`dark` class + `data-theme` attribute on `document.documentElement`, falls back to light on error.
2. **Tailwind dark variant:** `@variant dark (&:where(.dark, .dark *));` (Tailwind v4 syntax).
3. **Only raw tokens are overridden in `.dark`** — aliases re-resolve automatically (see §2). Never re-declare aliases in dark.
4. `color-scheme: light` on `:root`, `dark` under `.dark` (native scrollbars/inputs follow).
5. **Portaled content** (Radix popper wrappers) forced `z-50` + explicit dark `color-scheme` so floating layers inherit theme.
6. **Store:** zustand + persist (`theme-storage`), `partialize` to theme only; `getEffectiveTheme()` resolves system via `matchMedia('(prefers-color-scheme: dark)')`.
7. **Toggle UI:** outline/ghost button whose icon cross-fades Sun↔Moon; dropdown menu Light/Dark/System with active item `bg-accent`.
8. Dark palette principle: same hues, **lightened bases and deepened-inverted tints** — tints become dark washed panels (e.g. `--fern-tint: #1b2f25`), so tint-surface chips still work.

---

## 10. Component Specifications

All specs below are the exact classes from the codebase (shadcn variants restyled). Compose with `cn()`.

### 10.1 Button

Base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive`

| Variant | Classes |
|---------|---------|
| `default` (fern action) | `bg-primary text-primary-foreground hover:bg-primary-hover` |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40` |
| `outline` | `border bg-transparent hover:bg-accent hover:text-accent-foreground` |
| `secondary` | `bg-secondary text-secondary-foreground border hover:bg-accent` |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| Size | Classes |
|------|---------|
| `default` | `h-9 px-4 py-2 has-[>svg]:px-3` |
| `sm` | `h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5` |
| `lg` | `h-10 rounded-md px-6 has-[>svg]:px-4` |
| `icon` | `size-9` |

Usage: **one** `default` (fern) button per view region; destructive only for deletes; ghost for toolbars/cards; outline for dialog Cancel (AlertDialogCancel uses outline, Action uses default).

### 10.2 Badge

Base: `inline-flex items-center justify-center rounded-sm border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 transition-[color,box-shadow] overflow-hidden`

| Variant | Classes |
|---------|---------|
| `default` | `border-transparent bg-fern-tint text-primary dark:text-fern [a&]:hover:bg-fern-tint/80` |
| `secondary` | `bg-popover text-muted-foreground [a&]:hover:bg-accent` — the chip carrier (type dots, mono metadata) |
| `destructive` | `border-transparent bg-destructive-tint text-destructive [a&]:hover:bg-destructive-tint/80` |
| `outline` | `text-foreground [a&]:hover:bg-accent` — neutral, often `font-mono text-[11px]` |

With a type dot: `<Badge variant="secondary"><span class="size-2 rounded-full bg-type-pdf"/>PDF</Badge>`.

### 10.3 Card

- `Card`: `bg-card text-card-foreground flex flex-col gap-6 rounded-lg border py-6` — **no shadow by default**.
- `CardHeader`: `grid auto-rows-min gap-1.5 px-6` (+action column when present); `CardTitle`: `leading-none font-semibold`; `CardDescription`: `text-muted-foreground text-sm`; `CardContent`: `px-6`; `CardFooter`: `flex items-center px-6`.
- Densities used in app: `px-3 py-1` (list cards like SourceCard) up to default `py-6` (feature cards).
- **Interactive card** → add `card-hover` (global utility): `transition-colors duration-150 cursor-pointer`, on hover `background: var(--surface-raised); box-shadow: var(--shadow-lift)`.
- Source list card variant: `shadow-none hover:border-sage/50` (hover signals with a sage-tinted border instead of elevation).

### 10.4 Input & Textarea

- **Input:** `flex h-9 w-full min-w-0 rounded-md border border-input bg-popover px-3 py-1 text-base md:text-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed` + the universal focus ring (`focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`) + invalid (`aria-invalid:…destructive`).
- **Textarea:** same surface but `min-h-16 px-3 py-2 field-sizing-content` (grows with content).
- Inputs sit on `bg-popover` (raised white) even inside cards — quiet lift, no inner shadow.

### 10.5 Label & FormSection

- **Label:** `flex items-center gap-2 text-sm leading-none font-medium select-none`.
- **FormSection** (settings-style groups): container `mb-6 last:mb-0`; header `text-base font-medium mb-1` + description `text-sm text-muted-foreground`; fields stack `space-y-3`.

### 10.6 Select (Radix)

- Trigger: `flex h-9 (sm: h-8) items-center justify-between gap-2 rounded-md border border-input bg-popover px-3 py-2 text-sm whitespace-nowrap data-[placeholder]:text-muted-foreground focus-visible:ring-[3px]` + chevron `size-4 opacity-50`.
- Content: `bg-popover rounded-md border p-1 shadow-pop z-50 max-h-(--radix-select-content-available-height) overflow-y-auto` + standard enter/exit animations + popper offset `translate-y-1`.
- Item: `rounded-sm px-2 py-1.5 pl-2 pr-8 text-sm focus:bg-accent focus:text-accent-foreground data-[disabled]:opacity-50` with right-aligned `CheckIcon size-4` indicator; Label: `px-2 py-1.5 text-xs text-muted-foreground`; Separator: `bg-border -mx-1 my-1 h-px`.

### 10.7 Checkbox & Radio

- **Checkbox:** `size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow` → checked: `bg-primary border-primary text-primary-foreground` (CheckIcon `size-3.5`). Focus/invalid like inputs.
- **Radio:** `size-4 rounded-full border border-input text-primary shadow-xs`; inner dot `fill-primary size-2` centered.
- Checkbox lists rows: `flex items-start gap-3 cursor-pointer hover:bg-muted p-2 rounded-md transition-colors`.

### 10.8 Tabs (underline style — signature)

- List: `inline-flex w-fit items-center justify-start gap-4 border-b border-border text-muted-foreground`.
- Trigger: `-mb-px inline-flex h-9 items-center gap-2 border-b-2 border-transparent px-1 text-sm font-medium transition-colors duration-150 hover:text-foreground` → active: `data-[state=active]:border-primary data-[state=active]:text-foreground` (the "fern spine" underline).
- Content: `flex-1 outline-none`, typically `pt-3 text-sm text-muted-foreground`.
- Mobile tab bars: `TabsList grid w-full grid-cols-3` with icons.

### 10.9 Dialog & AlertDialog

- Overlay: `fixed inset-0 z-50 bg-black/50` + fade animations.
- Content (Dialog): `bg-card fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-md(+) translate-x-[-50%] translate-y-[-50%] gap-5 rounded-xl border p-6 shadow-overlay duration-200 overflow-hidden` + zoom/fade animations. Close: absolute `right-4 top-4`, X `h-4 w-4 opacity-70 hover:opacity-100`.
- AlertDialog content: same but `sm:max-w-lg`; Action button = default variant, Cancel = outline.
- Header: `flex flex-col gap-2 text-center sm:text-left`; Title `text-lg font-semibold`; Description `text-sm text-muted-foreground`; Footer: `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` (ghost Cancel + default Confirm).

### 10.10 DropdownMenu / Popover / Tooltip / Command

- **DropdownMenu content:** `bg-popover rounded-md border p-1 shadow-pop min-w-[8rem] z-50` (+ directional slides); Item: `rounded-sm px-2 py-1.5 text-sm focus:bg-accent` with icons `text-muted-foreground`; destructive item: `text-destructive focus:bg-destructive/10 dark:focus:bg-destructive/20 focus:text-destructive [&_svg]:!text-destructive`; Label `px-2 py-1.5 text-sm font-medium`; Separator `bg-border -mx-1 my-1 h-px`; Shortcut `ml-auto text-xs tracking-widest text-muted-foreground`. `sideOffset=4`.
- **Popover content:** `bg-popover rounded-md border p-4 shadow-pop w-72 z-50` (+ animations), `sideOffset=4`.
- **Tooltip (inverted!):** `bg-foreground text-background rounded-md px-3 py-1.5 text-xs text-balance z-50` + arrow `size-2.5 rotate-45 rounded-[2px] bg-foreground fill-foreground`. Provider `delayDuration=0`.
- **Command (⌘K):** Dialog `p-0 overflow-hidden`; Command root `bg-popover rounded-md`; input wrapper `flex h-9 items-center gap-2 border-b px-3` (Search icon `opacity-50`), input `h-10 text-sm`; list `max-h-[300px] overflow-y-auto`; group heading `px-2 py-1.5 text-xs font-medium text-muted-foreground`; item `rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent`; shortcut `ml-auto text-xs tracking-widest text-muted-foreground`; empty `py-6 text-center text-sm`.

### 10.11 Progress, Separator, ScrollArea, Accordion, Collapsible

- **Progress:** track `bg-primary/20 h-2 w-full rounded-full overflow-hidden`; indicator `bg-primary h-full transition-all` via `translateX(-${100-value}%)`. Inline mini variant: track `bg-muted h-1.5 rounded-full`, fill `bg-teal h-1.5 rounded-full transition-all duration-300`.
- **Separator:** `bg-border shrink-0 h-px w-full` (or vertical `w-px h-full`).
- **ScrollArea:** custom scrollbar — track `w-2.5 border-l`, thumb `bg-border rounded-full`.
- **Accordion:** items `border-b`; trigger `py-4 text-sm font-medium hover:underline` with chevron `h-4 w-4 rotate-180` when open; content `overflow-hidden text-sm animate-accordion-up/down`.
- **Collapsible:** unstyled Radix wrapper (bring your own styles).

### 10.12 Alert

Base: `relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7`
- default: `bg-background text-foreground` · destructive: `border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive`.
- Title: `mb-1 font-medium leading-none tracking-tight`; Description: `text-sm [&_p]:leading-relaxed`. Icon at `size-4`.

### 10.13 Toaster (sonner)

Mapped to tokens: `--normal-bg: var(--popover)`, `--normal-text: var(--popover-foreground)`, `--normal-border: var(--border)` (success variant identical — quiet, no green wash).

### 10.14 Wizard (multi-step forms)

- Container: `flex flex-col h-[500px] overflow-hidden bg-card rounded-lg border`.
- Step bar: `flex items-center justify-between px-6 py-4 border-b bg-muted`.
- Step circle: `w-8 h-8 rounded-full border-2 text-sm font-medium` — done: `bg-primary border-primary text-primary-foreground` (✓); current: `border-primary text-primary bg-primary/10`; todo: `border-border text-muted-foreground bg-card`.
- Connector: `flex-1 border-t-2 mx-4` — `border-primary` when completed, else `border-border/60`. Step title `text-sm font-medium`, desc `text-xs text-muted-foreground`.

---

## 11. Layout System

### 11.1 App Shell (fixed sidebar + content column)

```
<div class="flex h-screen overflow-hidden">        ← AppShell
  <aside>  …sidebar (w-64 / w-16)…  </aside>
  <main class="flex-1 flex flex-col min-h-0 overflow-hidden">
     [setup banner]
     {page}                                        ← pages scroll internally
  </main>
</div>
```

### 11.2 Sidebar (the navigation instrument)

- Rail: `flex h-full flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300`, width `w-64` expanded / `w-16` collapsed.
- Header: `h-16` — logo + app name (`font-display text-[15px] font-bold tracking-tight`); collapses to centered pebbles; hover swaps to menu button (`group-hover:opacity-100 transition-opacity`).
- **Logo "pebbles":** three 9×9px squares `rounded-[3px]` in fern / gold / teal, `gap-[3px]` — the brand mark.
- Primary CTA: full-width `Button size="sm"` with Plus icon, opens a create-things dropdown.
- Section headers (eyebrow): `mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40`.
- Items: `Button variant="ghost" w-full gap-2.5 text-[13px] font-medium text-sidebar-foreground/80 justify-start`, hover `bg-sidebar-accent`.
- **Active item:** `bg-popover font-semibold text-sidebar-foreground ring-1 ring-inset ring-border` + **fern spine**: `before:absolute before:-left-1.5 before:top-[7px] before:bottom-[7px] before:w-[3px] before:rounded-[2px] before:bg-fern`.
- Sections divided by `Separator my-3`. Longest-href-wins matching for active route.
- Collapsed mode: icon-only buttons (`justify-center px-2`), tooltips on the right (`side="right"`).
- Footer: `border-t p-3 space-y-2` — command-palette hint row with **kbd**: `inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground` (`⌘K` / `Ctrl+K`), theme & language toggles, outline Sign-out button.
- Nav sections in app: Collect · Process · Create · Manage.

### 11.3 Page & Column Layouts

- **Page frame:** header `flex-shrink-0 p-6 pb-0` (title + actions), body `flex-1 p-6 overflow-auto` — pages never scroll the `<main>` directly; inner regions do.
- **Notebook workspace = 3 columns** (Sources / Notes / Chat): desktop `flex` row of card columns, each independently collapsible via `w-12` collapsed rail: `flex flex-col items-center justify-center gap-3 border rounded-lg bg-card hover:bg-accent/50 transition-all duration-150` with vertical label `writing-mode: vertical-rl; transform: rotate(180deg)` (skipped for CJK), expand affordance `group-hover:text-foreground`.
- **Mobile (<lg):** columns become a `Tabs` bar (`grid w-full grid-cols-3`, icons + labels); columns hidden.
- Column widths & visibility stored in a zustand store (persisted per user).
- Chat column: `flex-1 min-w-0` with sticky input at bottom; messages list scrolls.
- Search page: results with citation chips; StreamingResponse for AI answers.
- Standard content max widths: `max-w-md` forms, `max-w-3xl` card grids, `max-w-xl` alerts; grids `grid gap-4 lg:grid-cols-2`.

### 11.4 Responsive & Z-index

- Breakpoints: Tailwind defaults (`sm` 640 / `md` 768 / `lg` 1024). The lg boundary is the mobile/desktop layout switch.
- Z-index scale: everything floating = `z-50` (dialogs, menus, popovers, tooltips, command palette, Radix popper wrapper). Nothing else stacks.
- Dialogs: `max-w-[calc(100%-2rem)]` on mobile.

---

## 12. Application Patterns

### 12.1 Status System (async processing)

Status pill = `flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium` with icon `h-3 w-3`:

| Status | bg | text | border | Icon |
|--------|----|------|--------|------|
| new / queued / running | `bg-teal-tint` | `text-teal` | `border-teal/30` | Clock (Loader2 + `animate-spin` while running) |
| completed | `bg-fern-tint` | `text-fern` | `border-fern/30` | CheckCircle |
| failed | `bg-destructive-tint` | `text-destructive` | `border-destructive/30` | AlertTriangle |

Pattern rules: completed sources hide the pill entirely (quiet success); failed surfaces an inline retry `Button size="sm" h-7 text-xs` directly on the card (discoverability beats menu burial); processing shows an italic `text-xs text-muted-foreground` message + mini progress bar (`bg-muted h-1.5` track, `bg-teal` fill, % label).

### 12.2 Empty State

```
<div class="text-center py-12">
  <Icon class="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
  <h3 class="text-lg font-medium text-foreground mb-2">Title</h3>
  <p  class="text-muted-foreground mb-4">Description</p>
  [action button]
</div>
```

### 12.3 Loading

- Spinner: lucide `Loader2` + `animate-spin`, sizes `h-4/h-6/h-8` (sm/md/lg), color inherits.
- Page-level: `min-h-screen flex items-center justify-center` + spinner.
- Skeleton shimmer (checkbox-list): `h-4 bg-muted rounded w-3/4` bars. No spinners inside long lists.
- Overlays: `ConnectionErrorOverlay`/`LanguageLoadingOverlay` full-screen quiet panels; error details in `bg-muted p-3 rounded font-mono text-xs`.

### 12.4 Hover-Revealed Controls & Inline Edit

- Card overflow menu: `Button variant="ghost" size="sm" h-7 w-7 p-0 absolute top-1.5 right-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity`.
- Inline edit: text that becomes an input on click — `cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1 transition-colors`.

### 12.5 Context Toggle & Read-Indicator Chips

Per-source AI-context chips (FULL/INSIGHTS/OFF) — see §3.10; OFF chip uses neutral raised surface (visibly "switched off" without red).

### 12.6 Metadata Line (the quiet row)

One muted line under card titles: `flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground` — icon + type label, `·` separators, `truncate` for topics, `+N` overflow. Icons `h-3 w-3`.

### 12.7 Toasts, Banners & Version Chips

- Toasts via sonner (token-themed, §10.13); success toasts are neutral surface — the message text carries meaning, not color.
- Setup/migration banners: full-width strip above content (`flex-shrink-0`), surface-recessed bg + hairline bottom, small text + action button.
- Version/status chips: `Badge variant="outline" font-mono text-[11px]`.

### 12.8 Markdown / AI Answer Rendering

`.prose prose-sm prose-neutral dark:prose-invert max-w-none break-words` + overrides:
- `prose-headings:font-semibold prose-a:text-primary prose-a:break-all prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:bg-transparent prose-p:mb-4 prose-p:leading-7 prose-li:mb-2`
- Blockquote quote-marks stripped globally.
- Inline code: `bg-border rounded px-1 py-0.5`; code blocks: Prism `oneDark`/`oneLight` chosen by theme, `text-sm border border-border` wrapper; tables: `border-collapse border border-border`, `thead bg-muted`, cells `border px-3 py-2`.
- KaTeX for math; rehype-sanitize for safety.

---

## 13. Accessibility

- **Focus ring convention (universal):** `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` — teal 3px ring, never removed.
- `aria-invalid` recolors border+ring to destructive automatically on all inputs/controls.
- Icon-only buttons require `aria-label`; dialogs have sr-only titles when chrome-less; `sr-only` on decorative labels.
- Radix primitives give keyboard nav, focus trap, `role=alert`, `aria-expanded/checked` for free — keep them.
- Disabled: `disabled:opacity-50` (+ `pointer-events-none` or `cursor-not-allowed`); ink-faintest reserved for disabled text.
- Tooltips `delayDuration=0` for instant hints; kbd shortcuts displayed with platform detection (⌘ vs Ctrl).
- Color is never the sole signal (status pills pair color + icon + label; synthesis chip pairs dashed border + glyph).
- Theme respects `prefers-color-scheme` via system option; language detector respects browser locale (18 locales incl. CJK).

---

## 14. Do & Don't

**Do**
- Use fern for every positive/primary action; teal for anything the system/AI produced; clay for warnings; red strictly for delete/error.
- Separate blocks with hairlines; add `card-hover` for clickable cards; reserve `shadow-pop` for floating layers only.
- Keep radii 4–6px; keep one primary button per region; put chips/dots on `bg-popover`.
- Use mono for IDs/timestamps/versions/code; eyebrow headers `text-[10.5px] uppercase tracking-[0.14em]`.
- Hide advanced controls until context demands them (hover ⋮, collapsible columns, wizards).

**Don't**
- Don't tint reading surfaces or use color washes behind paragraphs (only `--excerpt-wash`).
- Don't use green for warnings, red for attention/branding, or the action hues for decorative accents.
- Don't use pill radii on buttons/cards, drop shadows on static layout, or display/mono fonts for body text.
- Don't invent new hues — derive from the 9 owned hues (+ neutrals). Don't hardcode hex in components — use the variables.

---

## 15. Porting Guide — Apply to Any Website

1. **Copy the CSS** from §16 into your global stylesheet (works with or without Tailwind — plain custom properties).
2. **Map fonts:** load Instrument Sans (400/500/600), Bricolage Grotesque (600/700), Spline Sans Mono (400). Set `font-sans` on body; reserve display for titles, mono for data.
3. **Set the theme switch:** add/remove class `dark` on `<html>`; include the no-flash inline script; optional system preference listener. Only override raw values in `.dark`.
4. **If using Tailwind v4:** paste the `@theme inline` block too — you instantly get `bg-primary`, `text-ink-soft`, `rounded-md` etc. **If not (plain CSS/framework):** use the variables directly: `background: var(--primary)`; implement the few global utilities from §16 (`.card-hover`, sidebar item, focus ring).
5. **If using shadcn/ui or any Radix kit:** paste the component class specs from §10 into your cva variants — they map 1:1 to the standard shadcn anatomy.
6. **Respect the laws** (§1) — the aesthetic collapses without the color-semantics discipline. When in doubt: hairline instead of shadow, neutral instead of tint, squared instead of round, quiet instead of loud.
7. **Smoke test:** toggle dark mode (chips/badges must stay legible — that's what tint-inversion buys you), tab through the UI (teal focus rings everywhere), hover every card (raised surface + lift shadow), open a popover (it alone casts a shadow).

---

## 16. Appendix — Complete Copy-Paste CSS

The entire token layer of `globals.css`, self-contained and framework-agnostic. (Tailwind bridge block included separately at the end.)

```css
/* ============ OPEN NOTEBOOK — "Quiet Green" tokens ============ */

:root {
  /* core palette — the owned hues */
  --fern: #2e6b4f;   --fern-deep: #245740;   --fern-tint: #dfeae2;
  --sage: #5e7a54;   --sage-deep: #47603f;   --sage-tint: #e5ebdc;
  --gold: #a97b12;   --gold-deep: #7c5a05;   --gold-tint: #f3ead3;
  --teal: #0e7268;   --teal-deep: #095a51;   --teal-tint: #ddece8;
  --plum: #5d4991;   --plum-tint: #eae6f3;
  --mauve: #8d5b80;  --mauve-deep: #714566;  --mauve-tint: #f1e5ee;
  --slate: #4e6b84;  --slate-deep: #3a5468;  --slate-tint: #e1e8ee;
  --violet: #6e51a6; --violet-deep: #57408a; --violet-tint: #ebe5f5;
  --clay: #b0451f;   --clay-deep: #93330f;   --clay-tint: #f5e4db;

  /* semantic raws — surfaces, ink, hairlines, action, danger */
  --bg: #f5f5f2;        --bg-deep: #eeeee9;
  --surface: #fefefc;   --surface-raised: #ffffff;
  --surface-recessed: #f4f4f0;  --surface-sunken: #ecece7;

  --ink: #23252a;  --ink-soft: #565a61;  --ink-faint: #878b92;  --ink-faintest: #a8abb1;

  --line: #e0e0da;  --line-soft: #e8e8e2;  --line-strong: #23252a;

  --primary: #2e6b4f;  --primary-hover: #245740;  --on-primary: #f1f8f3;

  --danger: #b0432d;  --danger-deep: #93341f;  --danger-tint: #f5e4df;
  --warn: var(--clay);  --warn-deep: var(--clay-deep);  --warn-tint: var(--clay-tint);

  /* sanctioned washes */
  --excerpt-wash: #ecf3f0;
  --best-match: rgba(14, 114, 104, 0.16);
  --best-match-ring: rgba(14, 114, 104, 0.16);

  /* depth */
  --shadow-soft: 0 1px 2px rgba(35, 37, 42, 0.06);
  --shadow-lift: 0 1px 3px rgba(35, 37, 42, 0.1);
  --shadow-pop: 0 1px 2px rgba(35, 37, 42, 0.08), 0 8px 26px rgba(35, 37, 42, 0.13);
  --shadow-overlay: 0 2px 6px rgba(35, 37, 42, 0.1), 0 16px 44px rgba(35, 37, 42, 0.18);

  /* content-type hues (dots, ticks, chips — never washes) */
  --type-video: var(--plum);   --type-video-soft: var(--plum-tint);
  --type-pdf: var(--gold);     --type-pdf-soft: var(--gold-tint);
  --type-web: var(--sage);     --type-web-soft: var(--sage-tint);
  --type-audio: var(--mauve);  --type-audio-soft: var(--mauve-tint);
  --type-paper: var(--slate);  --type-paper-soft: var(--slate-tint);
  --type-note: var(--gold);    --type-note-soft: var(--gold-tint);
  --type-ai: var(--teal);      --type-ai-soft: var(--teal-tint);
  --type-insight: var(--teal); --type-insight-soft: var(--teal-tint);

  /* evidence classes (citations) */
  --cite-source: var(--teal);      --cite-source-deep: var(--teal-deep);
  --cite-note: var(--gold);        --cite-note-deep: var(--gold-deep);
  --cite-derived: var(--violet);   --cite-derived-deep: var(--violet-deep);
  --cite-external: var(--slate);   --cite-external-deep: var(--slate-deep);
  --cite-synthesis: var(--ink-faint);
  --cite-warn: var(--clay);

  /* context states (per-source inclusion) */
  --ctx-full: var(--fern);         --ctx-full-tint: var(--fern-tint);
  --ctx-insights: var(--gold);     --ctx-insights-tint: var(--gold-tint);
  --ctx-off-ink: var(--ink-soft);  --ctx-off-bg: var(--surface-raised);

  /* motion */
  --motion-fast: 0.12s;  --motion-base: 0.15s;  --motion-slow: 0.25s;

  /* shape — squared: floor is 4px */
  --radius-sm: 4px;  --radius-md: 5px;  --radius-lg: 5px;  --radius-xl: 6px;

  /* ---- shadcn semantic slots (defined once; re-resolve in dark) ---- */
  --radius: 5px;
  --background: var(--bg);             --foreground: var(--ink);
  --card: var(--surface);              --card-foreground: var(--ink);
  --popover: var(--surface-raised);    --popover-foreground: var(--ink);
  --primary-foreground: var(--on-primary);
  --secondary: var(--surface-recessed); --secondary-foreground: var(--ink);
  --muted: var(--surface-recessed);    --muted-foreground: var(--ink-soft);
  --accent: var(--surface-sunken);     --accent-foreground: var(--ink);
  --destructive: var(--danger);
  --border: var(--line);               --input: var(--line);
  --ring: var(--teal);
  --chart-1: var(--fern);  --chart-2: var(--teal);  --chart-3: var(--gold);
  --chart-4: var(--plum);  --chart-5: var(--slate);
  --sidebar: var(--bg-deep);           --sidebar-foreground: var(--ink);
  --sidebar-primary: var(--primary);   --sidebar-primary-foreground: var(--on-primary);
  --sidebar-accent: var(--surface);    --sidebar-accent-foreground: var(--ink);
  --sidebar-border: var(--line);       --sidebar-ring: var(--teal);

  color-scheme: light;
}

/* ============ DARK — overrides raw values ONLY ============ */
.dark {
  --fern: #55b285;   --fern-deep: #6cc298;   --fern-tint: #1b2f25;
  --sage: #93b084;   --sage-deep: #a8c299;   --sage-tint: #232b1d;
  --gold: #cfa13e;   --gold-deep: #ddb55f;   --gold-tint: #322b1b;
  --teal: #3fb3a5;   --teal-deep: #64c5b9;   --teal-tint: #16302c;
  --plum: #a290d3;   --plum-tint: #29253a;
  --mauve: #c892ba;  --mauve-deep: #d6a8cb;  --mauve-tint: #322230;
  --slate: #8fafc8;  --slate-deep: #a5c1d6;  --slate-tint: #212b34;
  --violet: #a995db; --violet-deep: #bcaae6; --violet-tint: #2b2540;
  --clay: #f08a5c;   --clay-deep: #f5a07a;   --clay-tint: #35211a;

  --bg: #17181b;        --bg-deep: #121316;
  --surface: #1e2024;   --surface-raised: #24262b;
  --surface-recessed: #24262b;  --surface-sunken: #2b2d33;

  --ink: #ecedea;  --ink-soft: #a9acb1;  --ink-faint: #74777d;  --ink-faintest: #63666c;

  --line: #2e3036;  --line-soft: #26282d;  --line-strong: #ecedea;

  --primary: #3d8e67;  --primary-hover: #479e74;  --on-primary: #ecf7f0;

  --danger: #df7c63;  --danger-deep: #e9937d;  --danger-tint: #37231d;

  --excerpt-wash: #1c2a28;
  --best-match: rgba(63, 179, 165, 0.2);
  --best-match-ring: rgba(63, 179, 165, 0.2);

  --shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-lift: 0 1px 3px rgba(0, 0, 0, 0.45);
  --shadow-pop: 0 1px 2px rgba(0, 0, 0, 0.45), 0 10px 30px rgba(0, 0, 0, 0.5);
  --shadow-overlay: 0 2px 6px rgba(0, 0, 0, 0.4), 0 20px 52px rgba(0, 0, 0, 0.55);

  color-scheme: dark;
}

/* ============ Base & signature utilities ============ */
* { border-color: var(--border); outline-color: color-mix(in srgb, var(--ring) 50%, transparent); }
html { -webkit-font-smoothing: antialiased; }
body { background: var(--background); color: var(--foreground); transition: background-color var(--motion-base), color var(--motion-base); }

/* Cards separate with hairlines; hover raises the surface */
.card-hover { transition: background-color var(--motion-base) ease, box-shadow var(--motion-base) ease; cursor: pointer; }
.card-hover:hover { background-color: var(--surface-raised); border-color: var(--border); box-shadow: var(--shadow-lift); }

/* Sidebar menu items */
.sidebar-menu-item { transition: background-color var(--motion-base) ease-out; }
.sidebar-menu-item:hover { background-color: var(--sidebar-accent); }

/* The universal focus ring (add to every interactive element) */
:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent); }

/* Prose (rendered markdown) — strip blockquote quotes */
.prose blockquote p::before, .prose blockquote p::after { content: none; }

/* ============ No-flash theme script (inline in <head>) ============ */
/* <script>(function(){try{var t=JSON.parse(localStorage.getItem('theme-storage')||'{}').state?.theme||'system';
var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
var e=t==='system'?(d?'dark':'light'):t;
document.documentElement.classList.remove('light','dark');
document.documentElement.classList.add(e);
document.documentElement.setAttribute('data-theme',e);}catch(e){document.documentElement.classList.add('light');}})();</script> */

/* ============ Tailwind v4 bridge (only if using Tailwind) ============ */
/*
@import "tailwindcss";
@import "tw-animate-css";
@plugin "@tailwindcss/typography";
@variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: var(--background);   --color-foreground: var(--foreground);
  --color-card: var(--card);               --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);         --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);         --color-primary-foreground: var(--primary-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-secondary: var(--secondary);     --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);             --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);           --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive); --color-destructive-tint: var(--danger-tint);
  --color-border: var(--border);           --color-input: var(--input);   --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);         --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);  --color-sidebar-ring: var(--sidebar-ring);
  --font-sans: var(--font-instrument-sans), "Helvetica Neue", Arial, sans-serif;
  --font-mono: var(--font-spline-mono), ui-monospace, "SF Mono", Menlo, monospace;
  --font-display: var(--font-bricolage), "Avenir Next", "Trebuchet MS", sans-serif;
  --color-fern: var(--fern);  --color-fern-deep: var(--fern-deep);  --color-fern-tint: var(--fern-tint);
  --color-sage: var(--sage);  --color-sage-deep: var(--sage-deep);  --color-sage-tint: var(--sage-tint);
  --color-gold: var(--gold);  --color-gold-deep: var(--gold-deep);  --color-gold-tint: var(--gold-tint);
  --color-teal: var(--teal);  --color-teal-deep: var(--teal-deep);  --color-teal-tint: var(--teal-tint);
  --color-plum: var(--plum);  --color-plum-tint: var(--plum-tint);
  --color-mauve: var(--mauve); --color-mauve-deep: var(--mauve-deep); --color-mauve-tint: var(--mauve-tint);
  --color-slate-hue: var(--slate); --color-slate-hue-deep: var(--slate-deep); --color-slate-hue-tint: var(--slate-tint);
  --color-violet-hue: var(--violet); --color-violet-hue-deep: var(--violet-deep); --color-violet-hue-tint: var(--violet-tint);
  --color-clay: var(--clay); --color-clay-deep: var(--clay-deep); --color-clay-tint: var(--clay-tint);
  --color-warn: var(--warn); --color-warn-tint: var(--warn-tint);
  --shadow-soft: var(--shadow-soft);  --shadow-lift: var(--shadow-lift);
  --shadow-pop: var(--shadow-pop);    --shadow-overlay: var(--shadow-overlay);
}
*/
```

**Source-of-truth files** (for deeper cloning): `frontend/src/app/globals.css` (tokens + base) · `frontend/src/app/layout.tsx` (fonts/providers) · `frontend/src/app/dev/design/page.tsx` (living styleguide) · `frontend/src/components/ui/*` (all component classes) · `frontend/src/components/layout/AppSidebar.tsx` (nav spec) · `frontend/src/lib/theme-script.ts` + `theme-store.ts` (dark mode) · `frontend/components.json` (shadcn preset).
