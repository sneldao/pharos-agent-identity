import { type ChainNetwork } from "@/lib/network";

export function ChainBadge({ chain }: { chain: ChainNetwork }) {
  const isCasper = chain.kind === "casper";
  const color = isCasper ? "bg-sky" : "bg-terra";
  const label = isCasper ? "Casper Testnet" : "Pharos Atlantic";

  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-quiet">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}
