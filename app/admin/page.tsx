'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ImageRow = Database['public']['Tables']['images']['Row'];
type MemeRow = Database['public']['Tables']['memes']['Row'];
type MemeRatingRow = Database['public']['Tables']['meme_ratings']['Row'];

interface AdminMeme extends MemeRow {
  image?: ImageRow | null;
  displayUrl: string;
  likesCount: number;
}

interface AdminImage extends ImageRow {
  displayUrl: string;
  memesCount: number;
  uploader?: ProfileRow | null;
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'stats' | 'memes' | 'images' | 'gemini' | 'users'
  >('stats');

  // Data states
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [images, setImages] = useState<AdminImage[]>([]);
  const [memes, setMemes] = useState<AdminMeme[]>([]);
  const [ratings, setRatings] = useState<MemeRatingRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Moderation action states
  const [memeToDelete, setMemeToDelete] = useState<AdminMeme | null>(null);
  const [imageToDelete, setImageToDelete] = useState<AdminImage | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [geminiLoadingId, setGeminiLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter/Search states
  const [memeSearch, setMemeSearch] = useState('');
  const [imageSearch, setImageSearch] = useState('');
  const [orphanOnly, setOrphanOnly] = useState(false);

  // System Announcement state
  const [announcementText, setAnnouncementText] = useState('');
  const [savedAnnouncement, setSavedAnnouncement] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadAdminData = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1. Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) console.warn('Admin load profiles error:', profilesError);
      const profilesList = profilesData || [];
      setProfiles(profilesList);

      const profilesMap: Record<string, ProfileRow> = {};
      profilesList.forEach((p) => {
        profilesMap[p.id] = p;
      });

      // 2. Fetch all images
      const { data: rawImages, error: imagesError } = await supabase
        .from('images')
        .select('*')
        .order('created_at', { ascending: false });

      if (imagesError) console.warn('Admin load images error:', imagesError);

      // 3. Fetch all memes
      const { data: rawMemes, error: memesError } = await supabase
        .from('memes')
        .select('*')
        .order('created_at', { ascending: false });

      if (memesError) console.warn('Admin load memes error:', memesError);

      // 4. Fetch all meme ratings
      const { data: rawRatings, error: ratingsError } = await supabase
        .from('meme_ratings')
        .select('*');

      if (ratingsError) console.warn('Admin load ratings error:', ratingsError);
      const ratingsList = rawRatings || [];
      setRatings(ratingsList);

      const likesByMeme: Record<string, number> = {};
      ratingsList.forEach((r) => {
        if (r.liked) {
          likesByMeme[r.meme_id] = (likesByMeme[r.meme_id] || 0) + 1;
        }
      });

      const memesByImage: Record<string, number> = {};
      (rawMemes || []).forEach((m) => {
        if (m.image_id) {
          memesByImage[m.image_id] = (memesByImage[m.image_id] || 0) + 1;
        }
      });

      // Resolve display URLs for images
      const imagesMap: Record<string, AdminImage> = {};
      if (rawImages) {
        const enrichedImages: AdminImage[] = await Promise.all(
          rawImages.map(async (img) => {
            let displayUrl = '';
            if (img.url) {
              if (img.url.startsWith('http://') || img.url.startsWith('https://')) {
                displayUrl = img.url;
              } else {
                try {
                  const { data: signed } = await supabase.storage
                    .from('images')
                    .createSignedUrl(img.url, 3600);
                  if (signed?.signedUrl) displayUrl = signed.signedUrl;
                } catch {
                  // ignore
                }
                if (!displayUrl) {
                  const { data: pub } = supabase.storage
                    .from('images')
                    .getPublicUrl(img.url);
                  displayUrl = pub.publicUrl;
                }
              }
            }

            const enriched: AdminImage = {
              ...img,
              displayUrl,
              memesCount: memesByImage[img.id] || 0,
              uploader: img.uploader_id ? profilesMap[img.uploader_id] : null,
            };
            imagesMap[img.id] = enriched;
            return enriched;
          })
        );
        setImages(enrichedImages);
      }

      // Resolve enriched memes
      if (rawMemes) {
        const enrichedMemes: AdminMeme[] = rawMemes.map((meme) => {
          const img = meme.image_id ? imagesMap[meme.image_id] : null;
          return {
            ...meme,
            image: img,
            displayUrl: img?.displayUrl || '',
            likesCount: likesByMeme[meme.id] || 0,
          };
        });
        setMemes(enrichedMemes);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      showToast('Error loading some admin datasets.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAuthAndInit = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!currentSession?.user) {
        setSession(null);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      setSession(currentSession);

      // Check is_super_admin on profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', currentSession.user.id)
        .maybeSingle();

      if (!isMounted) return;

      const hasAdmin = Boolean(profile?.is_super_admin);
      setIsSuperAdmin(hasAdmin);
      setLoading(false);

      if (hasAdmin) {
        await loadAdminData();
      }
    };

    checkAuthAndInit();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);

      if (currentSession?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', currentSession.user.id)
          .maybeSingle();

        if (isMounted) {
          const hasAdmin = Boolean(profile?.is_super_admin);
          setIsSuperAdmin(hasAdmin);
          if (hasAdmin) {
            loadAdminData();
          }
        }
      } else {
        setIsSuperAdmin(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadAdminData]);

  // Action 1: Hard Delete Meme (Super Admin override)
  const handleAdminDeleteMeme = async () => {
    if (!memeToDelete || !session?.access_token) return;
    setActionInProgress(memeToDelete.id);

    try {
      const res = await fetch(`/api/memes?id=${encodeURIComponent(memeToDelete.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Server returned HTTP ${res.status}: ${resText}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete meme');
      }

      setMemes((prev) => prev.filter((m) => m.id !== memeToDelete.id));
      showToast('Meme permanently deleted by Super Admin.');
      setMemeToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting meme';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // Action 2: Hard Delete Image (Super Admin override, cascades to memes & storage)
  const handleAdminDeleteImage = async () => {
    if (!imageToDelete || !session?.access_token) return;
    setActionInProgress(imageToDelete.id);

    try {
      const res = await fetch(`/api/images?id=${encodeURIComponent(imageToDelete.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Server returned HTTP ${res.status}: ${resText}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete image');
      }

      const deletedCount = data.deletedMemesCount ?? 0;
      setImages((prev) => prev.filter((img) => img.id !== imageToDelete.id));
      setMemes((prev) => prev.filter((m) => m.image_id !== imageToDelete.id));
      showToast(
        `Image and ${deletedCount} corresponding meme${deletedCount === 1 ? '' : 's'} deleted.`
      );
      setImageToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting image';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // Action 3: Trigger Gemini AI Summary for image missing description
  const handleTriggerGeminiSummary = async (img: AdminImage) => {
    if (!session?.access_token || !img.url) return;
    setGeminiLoadingId(img.id);

    try {
      const res = await fetch('/api/images/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          imageId: img.id,
          imagePath: img.url,
          mimeType: 'image/jpeg',
        }),
      });

      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Server returned HTTP ${res.status}: ${resText}`);
      }

      if (!res.ok || !data.summary) {
        throw new Error(data.error || 'Failed to generate summary with Gemini');
      }

      setImages((prev) =>
        prev.map((i) => (i.id === img.id ? { ...i, description: data.summary } : i))
      );
      showToast('Gemini summary generated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error generating summary';
      showToast(msg);
    } finally {
      setGeminiLoadingId(null);
    }
  };

  // Action 4: Toggle user super admin role
  const handleToggleSuperAdmin = async (targetUser: ProfileRow) => {
    if (!session?.access_token) return;
    const nextStatus = !targetUser.is_super_admin;
    setActionInProgress(targetUser.id);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          isSuperAdmin: nextStatus,
        }),
      });

      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Server returned HTTP ${res.status}: ${resText}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update user role');
      }

      setProfiles((prev) =>
        prev.map((p) =>
          p.id === targetUser.id ? { ...p, is_super_admin: nextStatus } : p
        )
      );
      showToast(`User ${nextStatus ? 'promoted to' : 'demoted from'} Super Admin.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating user role';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // Action 5: Save announcement
  const handleSaveAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedAnnouncement(announcementText.trim());
    showToast(
      announcementText.trim()
        ? 'Platform announcement published!'
        : 'Platform announcement cleared.'
    );
  };

  // Derived Statistics
  const totalUsers = profiles.length;
  const totalImages = images.length;
  const totalMemes = memes.length;
  const totalLikes = ratings.filter((r) => r.liked).length;
  const superAdminsCount = profiles.filter((p) => p.is_super_admin).length;

  const summarizedCount = images.filter((img) => Boolean(img.description)).length;
  const unsummarizedCount = totalImages - summarizedCount;
  const summaryRate = totalImages > 0 ? Math.round((summarizedCount / totalImages) * 100) : 0;

  const imagesWithMemesCount = images.filter((img) => img.memesCount > 0).length;
  const conversionRate = totalImages > 0 ? Math.round((imagesWithMemesCount / totalImages) * 100) : 0;
  const avgLikesPerMeme = totalMemes > 0 ? (totalLikes / totalMemes).toFixed(1) : '0.0';

  const orphanedImages = images.filter((img) => img.memesCount === 0);

  // Leaderboards
  const topMemes = [...memes].sort((a, b) => b.likesCount - a.likesCount).slice(0, 5);

  const creatorsMap: Record<string, { count: number; profile?: ProfileRow | null }> = {};
  images.forEach((img) => {
    if (img.uploader_id) {
      if (!creatorsMap[img.uploader_id]) {
        creatorsMap[img.uploader_id] = { count: 0, profile: img.uploader };
      }
      creatorsMap[img.uploader_id].count += 1;
    }
  });
  const topCreators = Object.entries(creatorsMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  // Filters for Memes tab
  const filteredMemes = memes.filter((m) => {
    if (!memeSearch.trim()) return true;
    return m.caption?.toLowerCase().includes(memeSearch.toLowerCase());
  });

  // Filters for Images tab
  const filteredImages = images.filter((img) => {
    if (orphanOnly && img.memesCount > 0) return false;
    if (!imageSearch.trim()) return true;
    return (
      img.description?.toLowerCase().includes(imageSearch.toLowerCase()) ||
      img.uploader?.email?.toLowerCase().includes(imageSearch.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-4 text-center">
        <div className="inline-block animate-spin text-3xl mb-3">⚙️</div>
        <p className="text-gray-600 font-medium text-sm">Verifying super admin privileges...</p>
      </div>
    );
  }

  // Gate 1: Not authenticated
  if (!session) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Super Admin Sign In Required</h2>
          <p className="text-sm text-gray-600 mb-6">
            You must be logged into a super admin account to view and access this control panel.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // Gate 2: Authenticated but not a super admin
  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <div className="text-4xl mb-3">🚫</div>
          <h2 className="text-lg font-bold text-red-900 mb-2">Access Denied</h2>
          <p className="text-sm text-red-700 mb-4">
            Your account ({session.user.email}) does not currently have super admin privileges.
          </p>
          <p className="text-xs text-red-600 mb-6 bg-red-100 p-2.5 rounded font-mono">
            public.profiles.is_super_admin = false
          </p>
          <Link
            href="/"
            className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-lg flex items-center gap-2">
          <span>🛡️</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Broadcast Announcement Banner if active */}
      {savedAnnouncement && (
        <div className="rounded-lg bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white p-3.5 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="text-base">📢</span>
            <span className="font-bold uppercase tracking-wider text-[10px] bg-white/20 px-2 py-0.5 rounded">
              Active Broadcast
            </span>
            <span>{savedAnnouncement}</span>
          </div>
          <button
            type="button"
            onClick={() => setSavedAnnouncement('')}
            className="text-xs text-white/80 hover:text-white underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🛡️</span>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">
              Super Admin Control Panel
            </h1>
            <span className="rounded-full bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
              Super Admin Verified
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Global management, content moderation, AI diagnostics, and platform statistics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAdminData}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>
          <Link
            href="/memes"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition"
          >
            Community View &rarr;
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {[
          { key: 'stats', label: '📊 Statistics & KPIs' },
          { key: 'memes', label: `🎭 Moderate Memes (${memes.length})` },
          { key: 'images', label: `🖼️ Moderate Images (${images.length})` },
          { key: 'gemini', label: `✨ Gemini AI Health (${unsummarizedCount} unsummarized)` },
          { key: 'users', label: `👥 User Roles (${profiles.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
              activeTab === tab.key
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: 5 STATISTICS & KPIS */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* 5 KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Stat 1: Total Users */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                <span>Total Users</span>
                <span className="text-base">👥</span>
              </div>
              <p className="text-2xl font-extrabold text-gray-900 mt-2">{totalUsers}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {superAdminsCount} {superAdminsCount === 1 ? 'Super Admin' : 'Super Admins'}
              </p>
            </div>

            {/* Stat 2: Total Uploaded Images */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                <span>Uploaded Images</span>
                <span className="text-base">🖼️</span>
              </div>
              <p className="text-2xl font-extrabold text-gray-900 mt-2">{totalImages}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {orphanedImages.length} unmemed ({orphanedImages.length > 0 ? 'orphans' : '0 orphans'})
              </p>
            </div>

            {/* Stat 3: Total Memes Created */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                <span>Total Memes</span>
                <span className="text-base">🎭</span>
              </div>
              <p className="text-2xl font-extrabold text-purple-700 mt-2">{totalMemes}</p>
              <p className="text-[11px] text-purple-600 font-medium mt-1">
                {conversionRate}% image conversion
              </p>
            </div>

            {/* Stat 4: Community Likes & Engagement */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                <span>Likes Cast</span>
                <span className="text-base">❤️</span>
              </div>
              <p className="text-2xl font-extrabold text-rose-600 mt-2">{totalLikes}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {avgLikesPerMeme} avg likes / meme
              </p>
            </div>

            {/* Stat 5: Gemini AI Health */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                <span>Gemini Summaries</span>
                <span className="text-base">✨</span>
              </div>
              <p className="text-2xl font-extrabold text-indigo-600 mt-2">{summaryRate}%</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {summarizedCount} of {totalImages} summarized
              </p>
            </div>
          </div>

          {/* Leaderboards & Insights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top 5 Most Liked Memes */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>🏆</span>
                  <span>Top 5 Most Liked Memes</span>
                </h3>
                <span className="text-xs text-gray-400">All-time</span>
              </div>

              {topMemes.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No memes available yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {topMemes.map((m, idx) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2.5"
                    >
                      <span className="text-xs font-bold text-gray-400 w-4">#{idx + 1}</span>
                      <div className="h-10 w-10 bg-gray-900 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {m.displayUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.displayUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-gray-400">N/A</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 line-clamp-1">
                          &ldquo;{m.caption}&rdquo;
                        </p>
                        <span className="text-[10px] text-gray-400">
                          {new Date(m.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="rounded-full bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 text-xs font-bold flex items-center gap-1">
                        <span>❤️</span>
                        <span>{m.likesCount}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Contributors */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>👑</span>
                  <span>Top Image Uploaders</span>
                </h3>
                <span className="text-xs text-gray-400">Creators</span>
              </div>

              {topCreators.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No uploads yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {topCreators.map(([userId, data], idx) => (
                    <div
                      key={userId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-gray-400 w-4">#{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {data.profile?.first_name || data.profile?.email || `User ${userId.slice(0, 8)}`}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {data.profile?.email || userId}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-md bg-blue-50 text-blue-700 px-2 py-1 font-bold text-xs">
                        {data.count} {data.count === 1 ? 'image' : 'images'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action 5: System Broadcast Banner Tool */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>📢</span>
              <span>Action: Broadcast System Announcement</span>
            </h3>
            <p className="text-xs text-gray-500">
              Display an immediate maintenance or contest alert across the admin and user feeds.
            </p>
            <form onSubmit={handleSaveAnnouncement} className="flex gap-2">
              <input
                type="text"
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                placeholder="e.g. 🎉 The Humor Project Halloween Meme Contest is now open!"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
              />
              <button
                type="submit"
                className="rounded-md bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition cursor-pointer"
              >
                Set Banner
              </button>
              {savedAnnouncement && (
                <button
                  type="button"
                  onClick={() => {
                    setAnnouncementText('');
                    setSavedAnnouncement('');
                    showToast('Broadcast banner removed.');
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  Clear
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: MODERATE MEMES */}
      {activeTab === 'memes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Global Meme Moderation</h3>
              <p className="text-xs text-gray-500">
                Override ownership restrictions to permanently delete any meme across the community.
              </p>
            </div>
            <input
              type="text"
              value={memeSearch}
              onChange={(e) => setMemeSearch(e.target.value)}
              placeholder="Search captions..."
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-900 outline-none focus:border-purple-600"
            />
          </div>

          {filteredMemes.length === 0 ? (
            <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500">
              No memes found matching search criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMemes.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs flex flex-col justify-between"
                >
                  <div className="relative aspect-video w-full bg-gray-900 flex items-center justify-center">
                    {m.displayUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.displayUrl}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">No image</span>
                    )}
                    <span className="absolute bottom-2 left-2 right-2 text-center text-white bg-black/80 text-xs font-bold uppercase px-2 py-0.5 rounded truncate">
                      {m.caption}
                    </span>
                  </div>

                  <div className="p-3.5 space-y-2">
                    <p className="text-xs font-bold text-gray-900 line-clamp-2">
                      &ldquo;{m.caption}&rdquo;
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                      <span>❤️ {m.likesCount} likes</span>
                      <span>{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMemeToDelete(m)}
                      disabled={actionInProgress === m.id}
                      className="w-full mt-2 rounded-md bg-red-50 border border-red-200 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>🗑️</span>
                      <span>Hard Delete Meme</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MODERATE IMAGES & ORPHANS */}
      {activeTab === 'images' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Global Image Moderation</h3>
              <p className="text-xs text-gray-500">
                Delete violating or orphaned images. Cascades to storage files and all associated memes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOrphanOnly(!orphanOnly)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  orphanOnly
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {orphanOnly ? '✓ Orphans Only (0 Memes)' : 'Filter Orphans'}
              </button>
              <input
                type="text"
                value={imageSearch}
                onChange={(e) => setImageSearch(e.target.value)}
                placeholder="Search description or user..."
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-900 outline-none focus:border-purple-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredImages.map((img) => (
              <div
                key={img.id}
                className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs flex flex-col justify-between"
              >
                <div className="relative aspect-square w-full bg-gray-900 flex items-center justify-center">
                  {img.displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.displayUrl}
                      alt=""
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">No preview</span>
                  )}
                  {img.memesCount === 0 && (
                    <span className="absolute top-2 right-2 rounded bg-amber-500/90 text-white px-2 py-0.5 text-[10px] font-bold">
                      Orphaned
                    </span>
                  )}
                </div>

                <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-[11px] text-gray-400">
                      Uploader: {img.uploader?.email || img.uploader_id?.slice(0, 8) || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-800 line-clamp-2 mt-1">
                      {img.description || '⚠️ Missing Gemini summary'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 space-y-1.5">
                    <span className="text-[11px] text-gray-500 block">
                      Associated memes: <strong>{img.memesCount}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setImageToDelete(img)}
                      disabled={actionInProgress === img.id}
                      className="w-full rounded-md bg-red-50 border border-red-200 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span>🗑️</span>
                      <span>Delete Image & Cascades</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: GEMINI AI HEALTH & MISSING SUMMARIES */}
      {activeTab === 'gemini' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>✨</span>
                <span>Gemini Multimodal AI Health & Diagnostic Pipeline</span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Monitor successfully summarized images and re-run Gemini on any image with missing descriptions.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 px-3 py-1.5 text-xs font-bold">
                {summaryRate}% Completion Rate
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700">
              <span>Image & Subject</span>
              <span>Gemini AI Summary Status</span>
              <span>Admin Action</span>
            </div>

            <div className="divide-y divide-gray-100">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-12 w-12 bg-gray-900 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {img.displayUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.displayUrl}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">N/A</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">
                        ID: {img.id}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Uploaded: {new Date(img.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 max-w-md">
                    {img.description ? (
                      <p className="text-xs text-gray-700 line-clamp-2">
                        {img.description}
                      </p>
                    ) : (
                      <span className="inline-block rounded bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold">
                        ⚠️ Summary missing or failed
                      </span>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => handleTriggerGeminiSummary(img)}
                      disabled={geminiLoadingId === img.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer disabled:opacity-50"
                    >
                      {geminiLoadingId === img.id ? (
                        <>
                          <span className="animate-spin">⚙️</span>
                          <span>Calling Gemini...</span>
                        </>
                      ) : (
                        <>
                          <span>✨</span>
                          <span>{img.description ? 'Re-run Gemini' : 'Run Gemini Summary'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: USER ROLE MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">User Role & Privilege Management</h3>
            <p className="text-xs text-gray-500">
              Grant or revoke super admin capabilities (`public.profiles.is_super_admin`).
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-gray-700 font-bold">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map((user) => {
                  const isCurrentCaller = user.id === session.user.id;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {user.first_name || user.last_name
                          ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                          : 'Anonymous User'}
                        {isCurrentCaller && (
                          <span className="ml-2 text-[10px] text-purple-600 font-bold bg-purple-50 px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{user.email || 'No email provided'}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {user.is_super_admin ? (
                          <span className="rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-bold">
                            Super Admin
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px]">
                            Standard User
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleSuperAdmin(user)}
                          disabled={actionInProgress === user.id}
                          className={`rounded px-2.5 py-1 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                            user.is_super_admin
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                          }`}
                        >
                          {actionInProgress === user.id ? (
                            'Updating...'
                          ) : user.is_super_admin ? (
                            'Demote from Admin'
                          ) : (
                            'Promote to Super Admin'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Meme Confirmation Modal */}
      {memeToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => !actionInProgress && setMemeToDelete(null)}
        >
          <div
            className="relative max-w-md w-full bg-white rounded-xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-base font-bold text-gray-900">Admin Hard Delete Meme</h3>
                <p className="text-xs text-red-600">This overrides user ownership.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600">
              Are you sure you want to delete meme: &ldquo;{memeToDelete.caption}&rdquo;?
              This will also purge all {memeToDelete.likesCount} community likes.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={Boolean(actionInProgress)}
                onClick={() => setMemeToDelete(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(actionInProgress)}
                onClick={handleAdminDeleteMeme}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionInProgress ? 'Deleting...' : 'Confirm Hard Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Image Confirmation Modal */}
      {imageToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => !actionInProgress && setImageToDelete(null)}
        >
          <div
            className="relative max-w-md w-full bg-white rounded-xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-base font-bold text-gray-900">Admin Hard Delete Image</h3>
                <p className="text-xs text-red-600">Cascading storage and meme removal.</p>
              </div>
            </div>

            <div className="rounded bg-red-50 p-3 border border-red-200 text-xs text-red-900 space-y-1">
              <p className="font-semibold">Deleting this image will remove:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-800">
                <li>Image file in Supabase Storage</li>
                <li>Database row in public.images</li>
                <li>{imageToDelete.memesCount} associated meme(s) and their likes</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={Boolean(actionInProgress)}
                onClick={() => setImageToDelete(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(actionInProgress)}
                onClick={handleAdminDeleteImage}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionInProgress ? 'Deleting...' : 'Confirm Cascade Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
