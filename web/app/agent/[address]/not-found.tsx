import { Rule } from "@/components/Rule";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-8 py-32">
      <p className="eyebrow">Not in the index</p>
      <Rule className="mt-4" />
      <h1 className="display mt-10 text-5xl text-ink">
        That isn&rsquo;t an address.
      </h1>
      <p className="mt-6 max-w-prose font-serif text-lg leading-relaxed text-ink-soft">
        Agent pages are addressed by their 20-byte wallet — twenty hexadecimal
        bytes after <span className="font-mono">0x</span>. Check the link and
        try again.
      </p>
      <a
        href="/"
        className="mt-12 inline-block text-sm text-ink underline decoration-rule decoration-1 underline-offset-4 transition-colors hover:decoration-terra"
      >
        ← Return to the index
      </a>
    </main>
  );
}
