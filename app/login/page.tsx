'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Initiating sign in with Google...');
  const initiatedRef = useRef(false);

  const startOAuth = async () => {
    try {
      setError(null);
      setStatus('Redirecting to Google / LionMail authentication...');

      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : 'http://localhost:3000/auth/callback';

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initiate sign in';
      console.error('Login initiation error:', err);
      setError(msg);
      setStatus('Sign in failed.');
    }
  };

  useEffect(() => {
    if (initiatedRef.current) return;
    initiatedRef.current = true;

    const checkAndLogin = async () => {
      // If user is already logged in, redirect them to /profile
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setStatus('Already signed in! Redirecting to profile...');
        router.replace('/profile');
        return;
      }

      await startOAuth();
    };

    checkAndLogin();
  }, [router]);

  return (
    <main className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center space-y-5">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-2xl">
            🔐
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold text-gray-900">Sign In</h1>
          <p className="text-sm text-gray-600 mt-1">{status}</p>
        </div>

        {!error && (
          <div className="flex justify-center py-2">
            <svg
              className="animate-spin h-7 w-7 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 text-left">
            <p className="font-semibold">Authentication Error</p>
            <p className="mt-0.5">{error}</p>
          </div>
        )}

        <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
          <button
            type="button"
            onClick={startOAuth}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
          >
            <span>Log In with LionMail / Google</span>
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-xs text-gray-500 hover:text-gray-700 underline cursor-pointer"
          >
            Cancel and return to home
          </button>
        </div>
      </div>
    </main>
  );
}
