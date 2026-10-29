'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/supabase/supabaseClient";
import AuthButton from "./authButton";

export default function Navbar() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkAdmin = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (session?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("is_super_admin")
          .eq("id", session.user.id)
          .maybeSingle();

        if (isMounted) {
          setIsSuperAdmin(Boolean(data?.is_super_admin));
        }
      } else {
        setIsSuperAdmin(false);
      }
    };

    checkAdmin();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("is_super_admin")
          .eq("id", session.user.id)
          .maybeSingle();

        if (isMounted) {
          setIsSuperAdmin(Boolean(data?.is_super_admin));
        }
      } else {
        setIsSuperAdmin(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="border-b border-gray-200 bg-white shadow-2xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-gray-900 hover:text-blue-600 transition"
          >
            The Humor Project
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Home
            </Link>
            <Link
              href="/memes"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Memes
            </Link>
            <Link
              href="/profile"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Profile
            </Link>
            <Link
              href="/upload"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              Upload
            </Link>
            <Link
              href="/my-images"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              My Images
            </Link>
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 transition"
              >
                <span>🛡️</span>
                <span>Admin</span>
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
