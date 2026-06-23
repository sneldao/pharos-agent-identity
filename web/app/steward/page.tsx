import Link from "next/link";
import { Rule } from "@/components/Rule";
import { Snippet } from "@/components/Snippet";
import { StewardRunner } from "@/components/StewardRunner";
import { network } from "@/lib/chain";

const DEFAULT_GOAL =
  "Operate as a Pharos agent that participates in escrow-backed commerce and can swap between approved venues.";

const SELF_HOSTED = `# 0G wallet (one-time, see docs/setup.md)
source .env.d/zerog.env
PRIVATE_KEY=0x... bash scripts/setup-zerog.ts

# Then run the loop against any goal
PRIVATE_KEY=0x... ligis agent run \\
  --goal "Operate as a Pharos agent that participates in escrow-backed commerce."`;

export const metadata = {
  title: "Steward — Ligis",
  description: "Watch an agent boot itself: mint, reason, gate, act, record.",
};

export default function StewardPage() {
  return (
    <main className="mx-auto max-w-3xl px-8 pt-12 pb-32 sm:pt-20">
      <header className="flex items-baseline justify-between text-xs">
        <p className="eyebrow">Ligis · steward 00</p>
        <Link
          href="/"
          className="text-sm text-ink-soft underline decoration-rule decoration-1 underline-offset-4 hover:text-ink hover:decoration-terra"
        >
          ← Index
        </Link>
      </header>

      <section className="mt-20">
        <h1 className="display text-5xl text-ink sm:text-6xl">
          Watch an agent
          <br />
          boot itself.
        </h1>
        <p className="mt-10 max-w-prose font-serif text-lg leading-relaxed text-ink-soft">
          The Trust Steward is the autonomous loop. Given a goal, it ensures
          its own identity token, asks 0G Compute which capabilities the goal
          calls for, checks the credential registry for each one, self-issues
          what is missing, and anchors a manifest of the evidence into 0G
          Storage.
        </p>
        <p className="mt-6 max-w-prose font-serif text-base italic leading-relaxed text-ink-quiet">
          This page runs a simulation of the loop against{" "}
          {network.name.toLowerCase()}. The events are mocked at believable
          timing so the shape of the loop is legible without provisioning a 0G
          wallet. Run it yourself locally — see below — to drive the real
          steward end to end.
        </p>
      </section>

      <section className="mt-24">
        <StewardRunner defaultGoal={DEFAULT_GOAL} />
      </section>

      <section className="mt-32">
        <header className="flex items-baseline justify-between">
          <p className="eyebrow">Or run it yourself</p>
          <p className="font-mono text-[11px] tabular text-ink-quiet">cli · authentic</p>
        </header>
        <Rule className="mt-4" />
        <p className="mt-8 max-w-prose font-serif text-base leading-relaxed text-ink-soft">
          The CLI runs the same loop against your own keys. Nothing is shared
          with this site. The output is identical JSON to the stream above.
        </p>
        <div className="mt-8">
          <Snippet code={SELF_HOSTED} lang="sh" />
        </div>
      </section>

      <footer className="mt-32 flex items-baseline justify-between text-xs text-ink-quiet">
        <Link
          href="/"
          className="text-ink-soft underline decoration-rule decoration-1 underline-offset-4 hover:text-ink hover:decoration-terra"
        >
          ← Return to the index
        </Link>
        <span className="font-mono tabular">
          {network.name.toLowerCase()} · chain {network.chainId}
        </span>
      </footer>
    </main>
  );
}
