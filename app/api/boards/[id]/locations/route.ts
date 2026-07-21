import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

// Simple in-process location store keyed by board_id
const locationStore: Record<string, {
  id: string; board_id: string; place_id: string; place_name: string;
  place_address: string; place_photo_url: string; lat: number; lng: number; notes: string | null; created_at: string;
}[]> = {};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const location = await request.json();
  const entry = {
    id: nanoid(8),
    board_id: params.id,
    place_id: location.place_id ?? "",
    place_name: location.place_name ?? "",
    place_address: location.place_address ?? "",
    place_photo_url: location.place_photo_url ?? "",
    lat: location.lat ?? 0,
    lng: location.lng ?? 0,
    notes: location.notes ?? null,
    created_at: new Date().toISOString(),
  };

  if (!locationStore[params.id]) locationStore[params.id] = [];
  locationStore[params.id].push(entry);

  return NextResponse.json({ location: entry }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { locationId } = await request.json();
  if (locationStore[params.id]) {
    locationStore[params.id] = locationStore[params.id].filter((l) => l.id !== locationId);
  }
  return NextResponse.json({ success: true });
}
