'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';
import { useUploadModal } from '@/app/context/UploadModalContext';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface UserStats {
  imagesCount: number;
  memesCount: number;
  totalLikes: number;
}

export default function ProfilePage() {
  const { openUploadModal } = useUploadModal();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // User engagement stats
  const [stats, setStats] = useState<UserStats>({
    imagesCount: 0,
    memesCount: 0,
    totalLikes: 0,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadProfileAndStats = useCallback(async (currentSession: Session) => {
    try {
      const userId = currentSession.user.id;

      // 1. Fetch user profile
      const { data: profData, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profError) {
        console.error('Error loading profile:', profError);
      } else if (profData) {
        setProfile(profData);
        setFirstName(profData.first_name || '');
        setLastName(profData.last_name || '');
      }

      // 2. Fetch user's uploaded images count
      const { data: userImages, error: imgError } = await supabase
        .from('images')
        .select('id')
        .eq('uploader_id', userId);

      const imagesCount = userImages?.length || 0;
      let memesCount = 0;
      let totalLikes = 0;

      if (!imgError && userImages && userImages.length > 0) {
        const imageIds = userImages.map((img) => img.id);

        // Fetch memes created from user's images
        const { data: userMemes } = await supabase
          .from('memes')
          .select('id')
          .in('image_id', imageIds);

        memesCount = userMemes?.length || 0;

        if (userMemes && userMemes.length > 0) {
          const memeIds = userMemes.map((m) => m.id);
          const { count: likesCount } = await supabase
            .from('meme_ratings')
            .select('*', { count: 'exact', head: true })
            .in('meme_id', memeIds)
            .eq('liked', true);

          totalLikes = likesCount || 0;
        }
      }

      setStats({
        imagesCount,
        memesCount,
        totalLikes,
      });
    } catch (err) {
      console.error('Error fetching profile information:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session: curSession } }) => {
      if (!isMounted) return;
      setSession(curSession);
      if (curSession?.user) {
        loadProfileAndStats(curSession);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, curSession) => {
      if (!isMounted) return;
      setSession(curSession);
      if (curSession?.user) {
        loadProfileAndStats(curSession);
      } else {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileAndStats]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user) return;

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setUpdateError('Both first name and last name are required.');
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);

    try {
      // 1. Update public.profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: trimmedFirst,
          last_name: trimmedLast,
        })
        .eq('id', session.user.id);

      if (profileError) {
        throw new Error(profileError.message || 'Failed to update profile record');
      }

      // 2. Also sync auth user_metadata if possible
      try {
        await supabase.auth.updateUser({
          data: {
            first_name: trimmedFirst,
            last_name: trimmedLast,
            full_name: `${trimmedFirst} ${trimmedLast}`.trim(),
          },
        });
      } catch {
        // non-blocking
      }

      setProfile((prev) =>
        prev
          ? { ...prev, first_name: trimmedFirst, last_name: trimmedLast }
          : {
              id: session.user.id,
              created_at: new Date().toISOString(),
              email: session.user.email ?? null,
              first_name: trimmedFirst,
              last_name: trimmedLast,
              is_super_admin: null,
            }
      );

      showToast('Profile information updated successfully! ✨');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while updating profile.';
      console.error('Profile update failed:', err);
      setUpdateError(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetForm = () => {
    setFirstName(profile?.first_name || '');
    setLastName(profile?.last_name || '');
    setUpdateError(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const hasChanges =
    firstName.trim() !== (profile?.first_name || '') ||
    lastName.trim() !== (profile?.last_name || '');

  // Loading skeleton state
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
        <div className="h-8 bg-gray-200 rounded-lg w-1/4 animate-pulse" />
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xs space-y-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-200" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-1/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated state
  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-2xs space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-3xl shadow-2xs">
            🔒
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Sign in Required</h2>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Please sign in to view and manage your profile, uploaded images, and created memes.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Link
              href="/login"
              className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition"
            >
              Sign In / Register
            </Link>
            <Link
              href="/"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Explore Memes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Compute initials and display name
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  const displayName = fullName || session.user.email || 'Humorist';
  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('').toUpperCase() ||
    displayName[0]?.toUpperCase() ||
    'U';

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : session.user.created_at
    ? new Date(session.user.created_at).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : 'Active';

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-xl flex items-center gap-2 animate-bounce">
          <span>🔔</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <span>👤</span>
            <span>Profile & Account</span>
          </h1>
        </div>
      </div>

      {/* User Hero Identity Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-2xl shadow-xs flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
                {profile?.is_super_admin && (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 border border-emerald-200 inline-flex items-center gap-1">
                    <span>🛡️</span>
                    <span>Super Admin</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{session.user.email}</p>
              <div className="flex items-center gap-2.5 mt-2 text-[11px] text-gray-400">
                <span>Member since {memberSince}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <Link
              href="/my-images"
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition"
            >
              My Images ({stats.imagesCount})
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Engagement Stats Strip - 3 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <Link
          href="/my-images"
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs hover:border-purple-300 hover:shadow-xs transition group text-left cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Uploaded Images</span>
            <span className="text-base group-hover:scale-110 transition">🖼️</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.imagesCount}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
            Manage your media library &rarr;
          </span>
        </Link>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Created Memes</span>
            <span className="text-base">🎭</span>
          </div>
          <p className="text-2xl font-bold text-purple-600 mt-1">{stats.memesCount}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
            From your uploaded images
          </span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left">
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Community Likes</span>
            <span className="text-base text-rose-500">❤️</span>
          </div>
          <p className="text-2xl font-bold text-rose-600 mt-1">{stats.totalLikes}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
            Likes received across your memes
          </span>
        </div>
      </div>

      {/* Profile Details Edit Form Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xs space-y-5">
        <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>✏️</span>
              <span>Personal Details</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Update your first and last names as they appear throughout JokeWorks.
            </p>
          </div>
          {hasChanges && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
              Unsaved Changes
            </span>
          )}
        </div>

        {updateError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
            <span>⚠️</span>
            <span>{updateError}</span>
          </div>
        )}

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="block text-xs font-semibold text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="first_name"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Jane"
                disabled={isUpdating}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-xs text-gray-900 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="last_name" className="block text-xs font-semibold text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="last_name"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Doe"
                disabled={isUpdating}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-xs text-gray-900 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  disabled
                  value={session.user.email || ''}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50/70 p-2.5 text-xs text-gray-500 outline-none cursor-not-allowed"
                />
                <span className="absolute right-2.5 top-2.5 text-[10px] font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                  Managed via Auth
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Unique User ID
              </label>
              <input
                type="text"
                disabled
                value={session.user.id}
                className="w-full rounded-lg border border-gray-200 bg-gray-50/70 p-2.5 text-[11px] font-mono text-gray-500 outline-none cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
            {hasChanges && (
              <button
                type="button"
                onClick={handleResetForm}
                disabled={isUpdating}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Reset
              </button>
            )}
            <button
              type="submit"
              disabled={isUpdating || !hasChanges}
              className="rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {isUpdating ? (
                <>
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Profile Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Quick Action Navigation Links
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
          Quick Account Navigation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/"
            className="p-3 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition flex items-center gap-3 group text-xs text-gray-700"
          >
            <span className="text-xl group-hover:scale-110 transition">🌐</span>
            <div>
              <p className="font-semibold text-gray-900">Explore Memes</p>
              <p className="text-[11px] text-gray-500">Browse the community feed</p>
            </div>
          </Link>

          <Link
            href="/my-images"
            className="p-3 rounded-xl border border-gray-200 hover:border-sky-300 hover:bg-sky-50/30 transition flex items-center gap-3 group text-xs text-gray-700"
          >
            <span className="text-xl group-hover:scale-110 transition">🖼️</span>
            <div>
              <p className="font-semibold text-gray-900">My Images</p>
              <p className="text-[11px] text-gray-500">View and caption your images</p>
            </div>
          </Link>

          <Link
            href="/upload"
            className="p-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition flex items-center gap-3 group text-xs text-gray-700"
          >
            <span className="text-xl group-hover:scale-110 transition">⬆️</span>
            <div>
              <p className="font-semibold text-gray-900">Upload Media</p>
              <p className="text-[11px] text-gray-500">Upload new images to library</p>
            </div>
          </Link>
        </div>
      </div> */}
    </div>
  );
}
