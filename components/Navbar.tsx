"use client";

import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { user } = useUser();
  const pathname = usePathname();

  function navClass(href: string) {
    return `text-sm transition-colors font-medium ${
      pathname === href
        ? "text-indigo-600"
        : "text-gray-500 hover:text-gray-900"
    }`;
  }

  return (
    <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2 font-bold text-gray-900 text-lg shrink-0">
          <span className="text-xl">🎬</span>
          ScoutAI
        </Link>

        <div className="flex items-center gap-4 sm:gap-5">
          <Link href="/search" className={navClass("/search")}>
            Find Locations
          </Link>
          {user && (
            <Link href="/dashboard/boards" className={navClass("/dashboard/boards")}>
              My Boards
            </Link>
          )}
          {user ? (
            <span className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-medium border border-indigo-100">
              Demo Mode
            </span>
          ) : (
            <Link
              href="/login"
              className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
