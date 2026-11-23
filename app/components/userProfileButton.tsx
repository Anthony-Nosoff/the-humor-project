'use client';

import Link from "next/link";
import { supabase } from "@/app/supabase/supabaseClient";
import type { Session } from "@supabase/supabase-js";

interface Profile {
  first_name?: string | null;
  last_name?: string | null;
}

interface UserProfileButtonProps {
  session: Session;
  profile: Profile | null;
}

export default function UserProfileButton({ session, profile }: UserProfileButtonProps) {
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const displayName =
    fullName ||
    (session.user.user_metadata?.full_name as string | undefined) ||
    session.user.email ||
    "User";

  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    displayName[0]?.toUpperCase() ||
    "U";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        id="user-name"
        data-testid="user-name"
        className="flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-800 hover:border-gray-400 hover:bg-gray-50 active:scale-95 transition-all duration-200 shadow-xs"
        title="View Profile"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="max-w-[140px] truncate sm:max-w-none">{displayName}</span>
      </Link>
      <button
        onClick={handleSignOut}
        className="flex h-9 items-center rounded-lg px-2.5 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all duration-200 cursor-pointer"
      >
        Sign Out
      </button>
    </div>
  );
}
