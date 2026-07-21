"use client";

import { User } from "@supabase/supabase-js";

// Mock user hook — always returns a logged-in demo user so all UI is visible
export function useUser(): { user: User | null; loading: boolean } {
  const mockUser = {
    id: "demo-user-001",
    email: "demo@scoutai.app",
    app_metadata: {},
    user_metadata: { full_name: "Demo User" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;

  return { user: mockUser, loading: false };
}
