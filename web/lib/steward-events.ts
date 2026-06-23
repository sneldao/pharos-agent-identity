export type Phase = "BOOT" | "REASON" | "GATE" | "ACT" | "RECORD";

export const PHASES: ReadonlyArray<{ key: Phase; label: string; gloss: string }> = [
  { key: "BOOT", label: "boot", gloss: "ensure the agent token exists" },
  { key: "REASON", label: "reason", gloss: "ask 0G Compute what capabilities the goal needs" },
  { key: "GATE", label: "gate", gloss: "check the credentials registry for each one" },
  { key: "ACT", label: "act", gloss: "self-issue any that are missing" },
  { key: "RECORD", label: "record", gloss: "anchor the manifest into 0G Storage" },
];

export type StewardEvent =
  | { type: "phase"; phase: Phase; status: "start" | "done" | "skip" }
  | { type: "delta"; phase: "REASON"; text: string }
  | { type: "capability"; phase: "GATE"; name: string; capable: boolean }
  | { type: "tx"; phase: "ACT"; name: string; txHash: string }
  | {
      type: "manifest";
      phase: "RECORD";
      rootHash: string;
      anchorTx: string;
    }
  | { type: "summary"; ok: boolean; tokenId?: string }
  | { type: "error"; message: string };
