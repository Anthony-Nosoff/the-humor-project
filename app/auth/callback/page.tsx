"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/supabase/supabaseClient";
import type { User } from "@supabase/supabase-js";

type Status = "loading" | "prompt_name" | "error";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const completeAuth = async () => {
      try {
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, "")
        );
        const queryParams = new URLSearchParams(window.location.search);

        let accessToken =
          queryParams.get("access_token") ?? hashParams.get("access_token");
        let refreshToken =
          queryParams.get("refresh_token") ?? hashParams.get("refresh_token");
        const code = queryParams.get("code");

        // If code is present (PKCE flow), exchange code for session
        if (!accessToken && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (isMounted) {
              setStatus("error");
              setErrorMessage(error.message);
            }
            return;
          }
          accessToken = data.session?.access_token ?? null;
          refreshToken = data.session?.refresh_token ?? null;
        }

        // If not in URL, check if supabase client already holds a session
        if (!accessToken) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            accessToken = session.access_token;
            refreshToken = session.refresh_token;
          }
        }

        if (!accessToken) {
          if (isMounted) {
            setStatus("error");
            setErrorMessage("No access token found in callback URL.");
          }
          return;
        }

        // Set session in client Supabase instance
        if (refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }

        // Persist token in HTTP-only cookie via server route handler
        const response = await fetch("/auth/v1/callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ access_token: accessToken }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (isMounted) {
            setStatus("error");
            setErrorMessage(data?.error ?? "Failed to complete authentication.");
          }
          return;
        }

        // Fetch user information
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser(accessToken);

        if (userError || !user) {
          if (isMounted) {
            setStatus("error");
            setErrorMessage(
              userError?.message ?? "Failed to retrieve user information."
            );
          }
          return;
        }

        if (isMounted) {
          setCurrentUser(user);
        }

        // Check if user has first_name and last_name in supabase public.profiles table
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError && profileError.code !== "PGRST116") {
          console.warn("Error fetching profile from public.profiles:", profileError);
        }

        const hasFirstName = Boolean(
          profile?.first_name && profile.first_name.trim().length > 0
        );
        const hasLastName = Boolean(
          profile?.last_name && profile.last_name.trim().length > 0
        );

        if (hasFirstName && hasLastName) {
          // Profile is complete with first and last name -> redirect as normal
          router.replace("/profile");
          return;
        }

        // Prompt for first name and last name
        if (isMounted) {
          const initialFirst =
            profile?.first_name?.trim() ||
            (user.user_metadata?.given_name as string) ||
            "";
          const initialLast =
            profile?.last_name?.trim() ||
            (user.user_metadata?.family_name as string) ||
            "";

          setFirstName(initialFirst);
          setLastName(initialLast);
          setStatus("prompt_name");
        }
      } catch (err: unknown) {
        if (isMounted) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "An unexpected error occurred during sign in."
          );
        }
      }
    };

    completeAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSaveName = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setFormError("Please enter both your first name and last name.");
      return;
    }

    if (!currentUser) {
      setFormError("User session not found. Please log in again.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const payload: {
        id: string;
        first_name: string;
        last_name: string;
        email?: string;
      } = {
        id: currentUser.id,
        first_name: trimmedFirst,
        last_name: trimmedLast,
      };

      if (currentUser.email) {
        payload.email = currentUser.email;
      }

      // Upsert into public.profiles
      let { error: saveError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (saveError) {
        // Fallback to update or insert if upsert encounters RLS conflict
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (existing) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ first_name: trimmedFirst, last_name: trimmedLast })
            .eq("id", currentUser.id);
          saveError = updateError;
        } else {
          const { error: insertError } = await supabase
            .from("profiles")
            .insert(payload);
          saveError = insertError;
        }
      }

      if (saveError) {
        setIsSubmitting(false);
        setFormError(
          saveError.message || "Failed to save profile. Please try again."
        );
        return;
      }

      // Profile complete -> redirect as normal
      router.replace("/profile");
    } catch (err: unknown) {
      setIsSubmitting(false);
      setFormError(
        err instanceof Error
          ? err.message
          : "Failed to save profile. Please try again."
      );
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center p-6">
      <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {status === "loading" && (
          <p className="text-center text-gray-700">Completing sign in...</p>
        )}

        {status === "error" && (
          <div className="text-center">
            <p className="font-medium text-red-600">{errorMessage}</p>
            <button
              onClick={() => router.replace("/")}
              className="mt-4 inline-block text-sm text-blue-600 underline hover:text-blue-800"
            >
              Return to home
            </button>
          </div>
        )}

        {status === "prompt_name" && (
          <div>
            <h1 className="text-center text-2xl font-bold text-gray-900">
              Complete Your Profile
            </h1>
            <p className="mt-1 text-center text-sm text-gray-600">
              Please provide your first and last name to finish signing in.
            </p>

            {formError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveName} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="first_name"
                  className="block text-sm font-medium text-gray-700"
                >
                  First Name
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  disabled={isSubmitting}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="last_name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Last Name
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  disabled={isSubmitting}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save and Continue"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
