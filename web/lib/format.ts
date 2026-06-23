import type { Address } from "viem";

const TRUNCATE_GLYPH = "··";

export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + TRUNCATE_GLYPH.length) return address;
  return `${address.slice(0, head)}${TRUNCATE_GLYPH}${address.slice(-tail)}`;
}

export function truncateHash(hash: string, head = 10, tail = 6): string {
  return truncateAddress(hash, head, tail);
}

export function isAddressLike(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(unixSeconds: bigint | number): string {
  const seconds = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  const delta = seconds - Math.floor(Date.now() / 1000);
  const abs = Math.abs(delta);
  if (abs < 60) return RELATIVE.format(Math.round(delta), "second");
  if (abs < 3600) return RELATIVE.format(Math.round(delta / 60), "minute");
  if (abs < 86400) return RELATIVE.format(Math.round(delta / 3600), "hour");
  if (abs < 2592000) return RELATIVE.format(Math.round(delta / 86400), "day");
  if (abs < 31536000) return RELATIVE.format(Math.round(delta / 2592000), "month");
  return RELATIVE.format(Math.round(delta / 31536000), "year");
}

const MONTH = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

export function monthYear(unixSeconds: bigint | number): string {
  const seconds = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  return MONTH.format(new Date(seconds * 1000)).toLowerCase();
}
