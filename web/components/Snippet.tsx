"use client";

import { useEffect, useState } from "react";

export function Snippet({ code, lang = "ts" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{lang}</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            } catch {}
          }}
          className="text-[11px] uppercase tracking-[0.16em] text-ink-quiet transition-colors hover:text-ink"
          aria-label="Copy snippet"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-paper-deep px-6 py-5 font-mono text-[13px] leading-relaxed tabular text-ink">
        {code}
      </pre>
    </div>
  );
}
