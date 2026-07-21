"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] px-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full border border-gray-200 shadow-sm text-center">
        <div className="text-4xl mb-3">🎬</div>
        <h2 className="font-bold text-2xl text-gray-900 mb-2">ScoutAI Demo</h2>
        <p className="text-gray-500 text-sm mb-6">
          This is a frontend preview running with mock data. Auth is disabled — you are automatically signed in as a demo user.
        </p>
        <Link
          href="/dashboard/boards"
          className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          Go to My Boards →
        </Link>
        <Link href="/" className="block text-xs text-gray-400 hover:text-gray-600 mt-4">
          Back to home
        </Link>
      </div>
    </div>
  );
}
