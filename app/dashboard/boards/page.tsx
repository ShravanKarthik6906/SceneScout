"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";

interface Board {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_slug: string;
  created_at: string;
  board_locations: { count: number }[];
}

export default function BoardsPage() {
  const { user } = useUser();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/boards")
      .then((r) => r.json())
      .then((d) => setBoards(d.boards ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  async function createBoard() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const { board } = await res.json();
    if (board) setBoards((prev) => [board, ...prev]);
    setNewName("");
    setShowCreate(false);
    setCreating(false);
  }

  async function deleteBoard(id: string) {
    if (!confirm("Delete this board and all its locations?")) return;
    await fetch(`/api/boards/${id}`, { method: "DELETE" });
    setBoards((prev) => prev.filter((b) => b.id !== id));
  }

  function copyShareLink(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/share/${slug}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Shoot Boards</h1>
          <p className="text-gray-500 text-sm mt-1">Organize and share your saved filming locations</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
        >
          + New Board
        </button>
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">New Shoot Board</h3>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBoard()}
              placeholder="Board name…"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={createBoard}
              disabled={!newName.trim() || creating}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-gray-400 hover:text-gray-600 px-3 py-2.5 rounded-xl text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-32 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && boards.length === 0 && (
        <div className="text-center py-24 text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <p className="font-medium">No boards yet</p>
          <p className="text-sm mt-1">Create a board to start saving locations.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {boards.map((board) => {
          const count = board.board_locations?.[0]?.count ?? 0;
          return (
            <div
              key={board.id}
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <Link href={`/dashboard/boards/${board.id}`} className="group flex-1">
                  <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {board.name}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {count} location{count !== 1 ? "s" : ""}
                  </p>
                </Link>
                <div className="flex gap-1 ml-3">
                  <button
                    onClick={() => copyShareLink(board.share_slug)}
                    title="Copy share link"
                    className="text-gray-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors text-sm"
                  >
                    🔗
                  </button>
                  <button
                    onClick={() => deleteBoard(board.id)}
                    title="Delete board"
                    className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors text-sm"
                  >
                    🗑
                  </button>
                </div>
              </div>
              {board.description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{board.description}</p>
              )}
              <div className="flex items-center justify-between mt-4">
                <Link
                  href={`/dashboard/boards/${board.id}`}
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  View locations →
                </Link>
                {board.is_public && (
                  <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Public
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
