# Ligis web — design system

Read this before generating UI. The rules below exist to protect Ligis from
defaulting to the AI-slop aesthetic (card-heavy dashboards, Inter on white,
purple gradients, shadow chrome). Direction is **curated catalog** — agents
and credentials presented like featured objects in a refined collection, not
tiles on a SaaS dashboard.

## Banned

The following words and patterns must not appear in component names, CSS, or
visual treatment. If a feature seems to need one, the design is wrong — pause
and reach for typography, whitespace, and hairlines instead.

- `card`, `tile`, `panel`, `widget`, `dashboard` — banned as component names
- `box-shadow`, `drop-shadow` — banned globally on UI surfaces
- `bg-gradient-*`, `linear-gradient`, `radial-gradient` — banned outside the
  generative-portrait component, where it is the point
- `Inter`, `Geist Sans`, `Roboto`, `Arial`, `Helvetica` — banned as UI faces
- Stat tiles, feature grids, hero gradients, "Get started" buttons that look
  like every other landing page — banned as compositions

## Required

- **Containment** is done by hairlines (`<Rule />`), whitespace, and
  typography hierarchy. Not by enclosed boxes.
- **Typography**: Hanken Grotesk (UI), Fraunces (editorial display), JetBrains
  Mono (hashes, addresses, capability names). All hashes and addresses use
  `tabular-nums` and the `··` mid-glyph for truncation, never `…`.
- **Palette**: warm paper background, deep graphite ink, terracotta as the
  single ceremonial accent (never used for chrome). Sage for valid, terra for
  attention, ink-quiet for revoked / inactive. One dominant tone per surface.
- **Motion**: at most one staggered reveal per page load. Hovers shift colour
  or underline, never scale or translate. All transitions honour
  `prefers-reduced-motion`.
- **Generative portraits**: deterministic, seeded by the agent address. The
  aesthetic target is risograph / art-print, not banknote / guilloché / seal.
  Crypto signalling is the failure mode — refuse it.

## Composition rules

- The home page is editorial, not a dashboard. Stats appear inline as numerals
  in prose ("1,247 agents minted on Pharos Atlantic"), not as tiles.
- Agent pages are full-bleed identity documents, not cards in a feed.
- Credential lists are ledger rows: columnar layout with hairlines between
  rows. No pills, no chips, no rounded containers.
- Architecture diagrams are hand-typeset SVG with proper labels, never the
  output of an auto-layout tool.

## Composition primitives

Only these compose surfaces:

| Primitive | What it is |
|---|---|
| `Rule` | hairline (0.5px) or edge (1px), tone default or soft |
| `AddressDisplay` | mono address, optional link to explorer, optional copy |
| `CopyButton` | quiet tracked-uppercase action, no border |
| typography classes (`display`, `eyebrow`, `font-mono`, `tabular`) | hierarchy |

New compositions extend these. If a new feature truly needs a new primitive,
it gets added here first, with a rule for when to use it.

## Tooling guardrails

- The `frontend-design` and `emil-design-eng` skills are invoked before
  generating any new surface.
- The `/styleguide` route is the source of truth. Features compose from it.
- Pull requests that introduce a banned word or break a required rule are
  rejected.

## Inspirations to match

- Aesop, A.P.C. archive, MAAP, On Running product pages — restraint, calm,
  considered
- It's Nice That, Are.na — editorial typography
- Robin Rendle's site, Linear's detail pages — quiet craft
- Field guides, museum specimen pages — labelled object presentation

## Inspirations to refuse

- shadcn template gallery, Vercel template gallery — the slop floor
- "SaaS dashboard" Dribbble shots — banned vocabulary
- Any landing page with a hero gradient and a feature grid
- Web3 dApp dashboards — Ligis is for agents; the UI is for humans curating
  the collection. It must not read as Web3 chrome.
