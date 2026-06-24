"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { EscListener, ScrollHint } from "./DynamicIsland";
import { FocusPanel } from "./FocusPanel";

const CatalogScene = dynamic(
  () => import("./CatalogScene").then((m) => m.CatalogScene),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-paper">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-quiet">
          composing the catalog…
        </p>
      </div>
    ),
  }
);

export function CatalogHero() {
  return (
    <section className="relative h-[100dvh] w-full overflow-hidden">
      <div className="absolute inset-0">
        <CatalogScene />
      </div>

      <EscListener />
      <FocusPanel />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex flex-col items-center gap-4 px-6 text-center sm:bottom-24"
      >
        <p className="max-w-2xl font-serif text-2xl leading-snug text-ink sm:text-3xl">
          AI agents that can prove
          <br className="hidden sm:inline" />{" "}
          <span className="italic">what they&rsquo;re allowed to do.</span>
        </p>
        <p className="max-w-xl font-serif text-base italic leading-relaxed text-ink-soft sm:text-lg">
          Permissions onchain, in one read. Click any tile to verify one.
        </p>
        <p className="hidden max-w-md font-mono text-[11px] uppercase tracking-[0.18em] text-ink-quiet sm:mt-2 sm:block">
          drag · scroll · WASD · click
        </p>
        <p className="max-w-md font-mono text-[11px] uppercase tracking-[0.18em] text-ink-quiet sm:hidden">
          drag · pinch · tap
        </p>
      </motion.div>

      <ScrollHint />
    </section>
  );
}
