import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { readAgentSnapshot, readCapabilityHistory, capabilities } from "@/lib/chain";
import { isAddressLike } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address: raw } = await params;
  if (!isAddressLike(raw)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  try {
    const subject = getAddress(raw) as Address;
    const [snap, history] = await Promise.all([
      readAgentSnapshot(subject),
      readCapabilityHistory(subject),
    ]);

    const capMap = new Map(capabilities.map((c) => [c.hash.toLowerCase(), c.id]));

    return NextResponse.json(
      {
        address: subject,
        exists: snap.exists,
        tokenId: snap.tokenId.toString(),
        controller: snap.controller,
        held: snap.held.map((h) => ({
          id: h.capability.id,
          label: h.capability.label,
        })),
        heldCount: snap.held.length,
        history: history.map((h) => ({
          capability: capMap.get(h.capabilityHash.toLowerCase()) ?? h.capabilityHash,
          capable: h.capable,
          block: h.blockNumber.toString(),
          txHash: h.txHash,
        })),
      },
      { headers: { "Cache-Control": "public, max-age=15" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
