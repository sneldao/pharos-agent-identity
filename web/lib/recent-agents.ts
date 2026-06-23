const KEY = "ligis:recent-agents";
const MAX = 8;

export type RecentAgent = { address: string; visitedAt: number };

export function recordVisit(address: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readRecents();
    const next: RecentAgent[] = [
      { address, visitedAt: Date.now() },
      ...existing.filter((r) => r.address.toLowerCase() !== address.toLowerCase()),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function readRecents(): RecentAgent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentAgent =>
          r && typeof r.address === "string" && typeof r.visitedAt === "number"
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}
