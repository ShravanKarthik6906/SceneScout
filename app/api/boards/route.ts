import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

// In-memory mock store for boards during dev
const boards: Record<string, { id: string; name: string; description: string | null; is_public: boolean; share_slug: string; created_at: string; board_locations: unknown[] }> = {};

export async function GET() {
  return NextResponse.json({ boards: Object.values(boards).reverse() });
}

export async function POST(request: NextRequest) {
  const { name, description } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const board = {
    id: nanoid(8),
    name: name.trim(),
    description: description ?? null,
    is_public: false,
    share_slug: nanoid(10),
    created_at: new Date().toISOString(),
    board_locations: [],
  };
  boards[board.id] = board;
  return NextResponse.json({ board }, { status: 201 });
}
