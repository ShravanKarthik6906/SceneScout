import { NextRequest, NextResponse } from "next/server";

// Shared in-memory store (same module-level reference as boards/route.ts in dev)
// In production this would be backed by Supabase.
const locations: Record<string, {
  id: string; board_id: string; place_id: string; place_name: string;
  place_address: string; place_photo_url: string; lat: number; lng: number; notes: string | null; created_at: string;
}[]> = {};

const boards: Record<string, { id: string; name: string; description: string | null; is_public: boolean; share_slug: string; created_at: string; board_locations: unknown[] }> = {};

function getBoardLocations(boardId: string) {
  return locations[boardId] ?? [];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const board = boards[params.id];
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ board: { ...board, board_locations: getBoardLocations(params.id) } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!boards[params.id]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updates = await request.json();
  boards[params.id] = { ...boards[params.id], ...updates };
  return NextResponse.json({ board: boards[params.id] });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  delete boards[params.id];
  delete locations[params.id];
  return NextResponse.json({ success: true });
}
