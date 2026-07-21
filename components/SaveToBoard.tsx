"use client";

import { useState, useEffect } from "react";
import { LocationResult } from "@/store/scoutStore";

interface Board {
  id: string;
  name: string;
}

interface SaveToBoardProps {
  location: LocationResult;
  onClose: () => void;
}

export default function SaveToBoard({ location, onClose }: SaveToBoardProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [newBoardName, setNewBoardName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/boards")
      .then((r) => r.json())
      .then((d) => setBoards(d.boards ?? []))
      .catch(() => setBoards([]))
      .finally(() => setLoading(false));
  }, []);

  async function saveToBoard(boardId: string) {
    setSaving(boardId);
    try {
      await fetch(`/api/boards/${boardId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: location.place_id,
          place_name: location.name,
          place_address: location.address,
          place_photo_url: location.photo_url,
          lat: location.lat,
          lng: location.lng,
        }),
      });
      setSuccess(boardId);
      setTimeout(onClose, 800);
    } finally {
      setSaving(null);
    }
  }

  async function createAndSave() {
    if (!newBoardName.trim()) return;
    setSaving("new");
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBoardName.trim() }),
      });
      const { board } = await res.json();
      if (board) await saveToBoard(board.id);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Save to Shoot Board</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {loading && <p className="text-sm text-gray-400 text-center py-4">Loading boards…</p>}
          {!loading && boards.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">No boards yet — create one below</p>
          )}
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => saveToBoard(board.id)}
              disabled={!!saving || success === board.id}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-sm font-medium text-gray-800 flex items-center justify-between"
            >
              {board.name}
              {success === board.id && <span className="text-green-500 text-xs">✓ Saved</span>}
              {saving === board.id && <span className="text-indigo-400 text-xs">Saving…</span>}
            </button>
          ))}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">New Board</p>
          <div className="flex gap-2">
            <input
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndSave()}
              placeholder="Board name…"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={createAndSave}
              disabled={!newBoardName.trim() || !!saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
