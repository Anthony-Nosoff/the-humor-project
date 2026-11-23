'use client';

import { supabase } from "@/app/supabase/supabaseClient";

interface LoginButtonProps {
  className?: string;
}

export default function LoginButton({ className }: LoginButtonProps) {
  async function runAuth() {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : "http://localhost:3000/auth/callback";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error("Error during authentication:", error);
    } else {
      console.log("Authentication successful:", data);
    }
  }

  return (
    <button
      onClick={runAuth}
      className={
        className ||
        "inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
      }
    >
      Log In with LionMail + Google
    </button>
  );
}
