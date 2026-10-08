'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/supabase/supabaseClient";
import type { Session } from "@supabase/supabase-js";

interface Profile {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // States for updating missing name on profile page if needed
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    async function loadSessionAndProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);

      if (session?.user) {
        console.log("User is authenticated:", session.user);

        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name, email")
          .eq("id", session.user.id)
          .maybeSingle();

        if (data) {
          setProfile(data);
          setFirstName(data.first_name ?? "");
          setLastName(data.last_name ?? "");
        }
      } else {
        console.log("User is not authenticated");
      }

      setLoading(false);
    }

    loadSessionAndProfile();
  }, []);

  const handleUpdateName = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.user) return;

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setUpdateError("Both first name and last name are required.");
      return;
    }

    setIsUpdating(true);
    setUpdateError("");

    const payload = {
      id: session.user.id,
      first_name: trimmedFirst,
      last_name: trimmedLast,
      email: session.user.email,
    };

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", session.user.id);

    if (error) {
      setUpdateError(error.message || "Failed to update profile.");
      setIsUpdating(false);
      return;
    }

    setProfile({
      first_name: trimmedFirst,
      last_name: trimmedLast,
      email: session.user.email,
    });
    setIsUpdating(false);
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-lg text-gray-600">Loading profile...</p>
      </div>
    );
  }

  if (session) {
    const hasName = Boolean(
      profile?.first_name?.trim() && profile?.last_name?.trim()
    );

    return (
      <>
        <h2 className="text-xl font-semibold">The Humor Project Assignment 3: Auth</h2>
        <span id="profile-page" className="text-2xl font-bold">Profile Page</span>
        <p className="text-lg">This page is protected and requires authentication to access.</p>
        <p className="text-lg">If you are seeing this page, it means you are successfully authenticated.</p>
        <p className="text-lg">You can view your profile information below:</p>

        {!hasName ? (
          <div className="mt-4 max-w-md rounded-md border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-lg font-semibold text-amber-900">Complete Your Profile</h3>
            <p className="text-sm text-amber-800">
              Please enter your first and last name to finish setting up your profile.
            </p>
            {updateError && (
              <p className="mt-2 text-sm text-red-600">{updateError}</p>
            )}
            <form onSubmit={handleUpdateName} className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  disabled={isUpdating}
                  className="mt-1 w-full rounded border border-gray-300 p-2 text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  disabled={isUpdating}
                  className="mt-1 w-full rounded border border-gray-300 p-2 text-sm text-black"
                />
              </div>
              <button
                type="submit"
                disabled={isUpdating}
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isUpdating ? "Saving..." : "Save Name"}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div>
              <h3 className="text-lg font-semibold">First Name:</h3>
              <p className="text-lg">{profile?.first_name}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Last Name:</h3>
              <p className="text-lg">{profile?.last_name}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Email:</h3>
              <p className="text-lg">{session.user.email}</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <button
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
          >
            Sign Out
          </button>
        </div>
      </>
    );
  } else {
    console.log('User is not authenticated');
    return (
      <>
        <h2 className="text-xl font-semibold">The Humor Project Assignment 3: Auth</h2>
        <span id="profile-page" className="text-2xl font-bold">Profile Page</span>
        <p className="text-lg">This page is protected and requires authentication to access.</p>
        <p className="text-lg">You are not authenticated. Please log in to access this page.</p>
        <div className="mt-4">
          <Link href="/" className="text-blue-500 underline">
            Go back to the home page
          </Link>
        </div>
      </>
    );
  }
}