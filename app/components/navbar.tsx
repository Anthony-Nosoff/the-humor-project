'use client';

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/app/supabase/supabaseClient";
import AuthButton from "./authButton";
import { useUploadModal } from "@/app/context/UploadModalContext";

export default function Navbar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const { openUploadModal } = useUploadModal();

  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
    opacity: number;
  }>({ left: 0, width: 0, opacity: 0 });

  const isExplore = pathname === '/' || pathname === '/explore';
  const isProfile = pathname === '/profile';
  const isMyImages = pathname === '/my-images';
  const isAdmin = pathname === '/admin';

  useEffect(() => {
    const updateIndicator = () => {
      if (!navRef.current) return;

      let activeKey = '';
      if (isExplore) activeKey = 'explore';
      else if (isProfile) activeKey = 'profile';
      else if (isMyImages) activeKey = 'my-images';

      if (!activeKey) {
        setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
        return;
      }

      const activeEl = navRef.current.querySelector<HTMLElement>(`[data-nav-key="${activeKey}"]`);
      if (activeEl) {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
          opacity: 1,
        });
      } else {
        setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
      }
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [pathname, isExplore, isProfile, isMyImages]);

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
            className="text-lg font-bold tracking-tight transition hover:opacity-90"
          >
            <span className="text-purple-600">Joke</span>
            <span className="text-gray-900">Works</span>
          </Link>
          <nav ref={navRef} className="relative flex items-center gap-5 py-1">
            <Link
              href="/"
              data-nav-key="explore"
              className={`relative py-1 text-sm transition-all duration-200 ${
                isExplore
                  ? 'text-gray-900'
                  : 'font-medium text-gray-600 hover:text-gray-900'
              }`}
            >
              Explore
            </Link>
            <Link
              href="/profile"
              data-nav-key="profile"
              className={`relative py-1 text-sm transition-all duration-200 ${
                isProfile
                  ? 'text-gray-900'
                  : 'font-medium text-gray-600 hover:text-gray-900'
              }`}
            >
              Profile
            </Link>
            <Link
              href="/my-images"
              data-nav-key="my-images"
              className={`relative py-1 text-sm transition-all duration-200 ${
                isMyImages
                  ? 'text-gray-900'
                  : 'font-medium text-gray-600 hover:text-gray-900'
              }`}
            >
              My Images
            </Link>
            {isSuperAdmin && (
              <Link
                href="/admin"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-sm transition-all duration-200 ${
                  isAdmin
                    ? 'bg-amber-200 font-bold text-amber-950 ring-2 ring-amber-400'
                    : 'bg-amber-100 font-medium text-amber-900 hover:bg-amber-200'
                }`}
              >
                <span>🛡️</span>
                <span>Admin</span>
              </Link>
            )}

            {/* Smooth animated active page indicator */}
            <span
              className="absolute -bottom-1 h-0.5 rounded-full bg-purple-600 transition-all duration-300 ease-out pointer-events-none"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                opacity: indicatorStyle.opacity,
              }}
              aria-hidden="true"
            />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openUploadModal}
            className="hidden md:inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent bg-purple-600 px-3.5 text-sm font-bold text-white shadow-xs hover:bg-purple-700 active:scale-95 transition-all duration-200 cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Upload</span>
          </button>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
