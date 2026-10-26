'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/app/supabase/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import LoginButton from "./loginButton";
import UserProfileButton from "./userProfileButton";

interface Profile {
  first_name?: string | null;
  last_name?: string | null;
}

export default function AuthButton() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSessionAndProfile() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (!session) {
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        setSession(session);

        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (isMounted) {
          if (data) {
            setProfile(data);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading session or profile:", err);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSessionAndProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);

      if (newSession?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", newSession.user.id)
          .maybeSingle();

        if (isMounted && data) {
          setProfile(data);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="h-9 w-24 animate-pulse rounded-md bg-gray-100" />;
  }

  if (session) {
    return <UserProfileButton session={session} profile={profile} />;
  }

  return <LoginButton />;
}

