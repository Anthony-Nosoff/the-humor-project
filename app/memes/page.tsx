'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';

type MemeRow = Database['public']['Tables']['memes']['Row'];
type ImageRow = Database['public']['Tables']['images']['Row'];
type MemeRatingRow = Database['public']['Tables']['meme_ratings']['Row'];

interface EnrichedMeme extends MemeRow {
  image?: ImageRow | null;
  displayUrl: string;
  likesCount: number;
  userLiked: boolean;
}

export default function MemesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [memes, setMemes] = useState<EnrichedMeme[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'most-liked'>('newest');
  const [filterBy, setFilterBy] = useState<'all' | 'mine'>('all');
  const [ratingInProgress, setRatingInProgress] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [memeToDelete, setMemeToDelete] = useState<EnrichedMeme | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMemes = useCallback(async (currentUserId?: string) => {
    setLoading(true);
    try {
      // 1. Fetch all memes
      const { data: rawMemes, error: memesError } = await supabase
        .from('memes')
        .select('*')
        .order('created_at', { ascending: false });

      if (memesError) {
        console.error('Error fetching memes:', memesError);
        setMemes([]);
        return;
      }

      if (!rawMemes || rawMemes.length === 0) {
        setMemes([]);
        return;
      }

      // 2. Fetch associated images
      const imageIds = Array.from(
        new Set(rawMemes.map((m) => m.image_id).filter((id): id is string => Boolean(id)))
      );

      const imagesMap: Record<string, ImageRow> = {};
      if (imageIds.length > 0) {
        const { data: imagesData } = await supabase
          .from('images')
          .select('*')
          .in('id', imageIds);

        if (imagesData) {
          imagesData.forEach((img) => {
            imagesMap[img.id] = img;
          });
        }
      }

      // 3. Fetch ratings for all memes
      const memeIds = rawMemes.map((m) => m.id);
      const { data: ratingsData } = await supabase
        .from('meme_ratings')
        .select('*')
        .in('meme_id', memeIds);

      const ratingsByMeme: Record<string, MemeRatingRow[]> = {};
      if (ratingsData) {
        ratingsData.forEach((r) => {
          if (!ratingsByMeme[r.meme_id]) {
            ratingsByMeme[r.meme_id] = [];
          }
          ratingsByMeme[r.meme_id].push(r);
        });
      }

      // 4. Resolve display URLs and compute ratings for each meme
      const enriched: EnrichedMeme[] = await Promise.all(
        rawMemes.map(async (meme) => {
          const img = meme.image_id ? imagesMap[meme.image_id] : null;
          let displayUrl = '';

          if (img?.url) {
            if (img.url.startsWith('http://') || img.url.startsWith('https://')) {
              displayUrl = img.url;
            } else {
              try {
                const { data: signedData } = await supabase.storage
                  .from('images')
                  .createSignedUrl(img.url, 3600);
                if (signedData?.signedUrl) {
                  displayUrl = signedData.signedUrl;
                }
              } catch {
                // ignore error
              }

              if (!displayUrl) {
                const { data: publicData } = supabase.storage
                  .from('images')
                  .getPublicUrl(img.url);
                displayUrl = publicData.publicUrl;
              }
            }
          }

          const memeRatings = ratingsByMeme[meme.id] || [];
          const likesCount = memeRatings.filter((r) => r.liked).length;
          const userLiked = currentUserId
            ? memeRatings.some((r) => r.user_id === currentUserId && r.liked)
            : false;

          return {
            ...meme,
            image: img,
            displayUrl,
            likesCount,
            userLiked,
          };
        })
      );

      setMemes(enriched);
    } catch (err) {
      console.error('Failed to load memes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkSessionAndLoad = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!isMounted) return;
      setSession(currentSession);
      await fetchMemes(currentSession?.user?.id);
    };

    checkSessionAndLoad();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      fetchMemes(currentSession?.user?.id);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchMemes]);

  const handleToggleLike = async (meme: EnrichedMeme) => {
    if (!session?.user) {
      setToastMessage('Please sign in to like memes!');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    if (ratingInProgress[meme.id]) return;

    // Optimistic UI update
    const nextUserLiked = !meme.userLiked;
    const nextLikesCount = nextUserLiked ? meme.likesCount + 1 : Math.max(0, meme.likesCount - 1);

    setMemes((prev) =>
      prev.map((m) =>
        m.id === meme.id
          ? { ...m, userLiked: nextUserLiked, likesCount: nextLikesCount }
          : m
      )
    );

    setRatingInProgress((prev) => ({ ...prev, [meme.id]: true }));

    try {
      const response = await fetch('/api/memes/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          memeId: meme.id,
          liked: true, // liking action toggles on or off
        }),
      });

      const resText = await response.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Server returned HTTP ${response.status}: ${resText || response.statusText}`);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update rating');
      }

      // Reconcile with actual server count
      setMemes((prev) =>
        prev.map((m) =>
          m.id === meme.id
            ? { ...m, userLiked: data.userLiked === true, likesCount: data.likesCount }
            : m
        )
      );

      setToastMessage(data.userLiked ? 'Meme liked! ❤️' : 'Rating removed');
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err: unknown) {
      console.error('Error rating meme:', err);
      // Revert optimistic update on failure
      setMemes((prev) =>
        prev.map((m) =>
          m.id === meme.id
            ? { ...m, userLiked: meme.userLiked, likesCount: meme.likesCount }
            : m
        )
      );
      setToastMessage('Failed to update rating. Please try again.');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setRatingInProgress((prev) => ({ ...prev, [meme.id]: false }));
    }
  };

  const handleConfirmDelete = async () => {
    if (!memeToDelete) return;

    if (!session?.access_token) {
      setToastMessage('You must be signed in to delete a meme.');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    setDeletingId(memeToDelete.id);

    try {
      const response = await fetch(`/api/memes?id=${encodeURIComponent(memeToDelete.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const resText = await response.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Server returned HTTP ${response.status}: ${resText || response.statusText}`);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete meme');
      }

      setMemes((prev) => prev.filter((m) => m.id !== memeToDelete.id));
      setToastMessage('Meme deleted successfully');
      setTimeout(() => setToastMessage(null), 3000);
      setMemeToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete meme';
      console.error('Error deleting meme:', err);
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setDeletingId(null);
    }
  };

  const myMemesCount = session?.user
    ? memes.filter((m) => m.image?.uploader_id === session.user.id).length
    : 0;

  const filteredMemes = memes.filter((m) => {
    if (filterBy === 'mine') {
      return session?.user && m.image?.uploader_id === session.user.id;
    }
    return true;
  });

  const sortedMemes = [...filteredMemes].sort((a, b) => {
    if (sortBy === 'most-liked') {
      if (b.likesCount !== a.likesCount) {
        return b.likesCount - a.likesCount;
      }
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-lg flex items-center gap-2 animate-fade-in">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Community Memes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse and rate humorous memes created by all users!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Feed filter (All vs My Memes) if signed in */}
          {session?.user && (
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setFilterBy('all')}
                className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                  filterBy === 'all'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Memes ({memes.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterBy('mine')}
                className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                  filterBy === 'mine'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                My Memes ({myMemesCount})
              </button>
            </div>
          )}

          {/* Sort selector */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setSortBy('newest')}
              className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                sortBy === 'newest'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => setSortBy('most-liked')}
              className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                sortBy === 'most-liked'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🔥 Most Liked
            </button>
          </div>

          <Link
            href="/upload"
            className="inline-flex items-center justify-center rounded-md bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition"
          >
            + Make a Meme
          </Link>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs space-y-3 animate-pulse"
            >
              <div className="aspect-video w-full bg-gray-200 rounded-lg" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : sortedMemes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center bg-gray-50">
          <span className="text-4xl">🎭</span>
          <h3 className="mt-3 text-base font-semibold text-gray-900">
            {filterBy === 'mine' ? "You haven't created any memes yet" : 'No memes yet'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {filterBy === 'mine'
              ? 'Turn one of your uploaded images into a meme or upload a new image!'
              : 'Be the first to upload an image and create a hilarious meme!'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {filterBy === 'mine' && (
              <button
                type="button"
                onClick={() => setFilterBy('all')}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                View All Memes
              </button>
            )}
            <Link
              href="/upload"
              className="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-purple-700 transition"
            >
              Upload & Make Meme
            </Link>
            <Link
              href="/my-images"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              My Images
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedMemes.map((meme) => {
            const isOwner = Boolean(
              session?.user?.id && meme.image?.uploader_id === session.user.id
            );

            return (
              <div
                key={meme.id}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xs hover:shadow-md transition overflow-hidden"
              >
                {/* Meme Image Container */}
                <div className="relative aspect-square w-full bg-gray-900 overflow-hidden flex items-center justify-center">
                  {/* "Your Meme" Badge */}
                  {isOwner && (
                    <div className="absolute top-2.5 left-2.5 z-10 rounded-full bg-purple-600/90 text-white px-2.5 py-0.5 text-[10px] font-bold tracking-wide backdrop-blur-xs shadow-xs">
                      Your Meme
                    </div>
                  )}

                  {meme.displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meme.displayUrl}
                      alt={meme.caption || 'Meme image'}
                      className="h-full w-full object-contain p-2 group-hover:scale-[1.02] transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-gray-400 text-xs">Image unavailable</div>
                  )}

                  {/* Classic Meme Caption Overlay at Bottom */}
                  {meme.caption && (
                    <div className="absolute inset-x-0 bottom-3 px-3 text-center pointer-events-none">
                      <span className="inline-block bg-black/80 text-white font-black text-sm sm:text-base px-3 py-1.5 rounded uppercase tracking-wide leading-tight shadow-lg backdrop-blur-2xs">
                        {meme.caption}
                      </span>
                    </div>
                  )}
                </div>

                {/* Meme Card Body & Rating Controls */}
                <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                  {/* Caption Title */}
                  <div>
                    <p className="font-semibold text-gray-900 text-base leading-snug line-clamp-2">
                      &ldquo;{meme.caption}&rdquo;
                    </p>
                    {meme.image?.description && (
                      <p className="text-xs text-gray-400 line-clamp-1 mt-1">
                        Context: {meme.image.description}
                      </p>
                    )}
                  </div>

                  {/* Rating Button & Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    {/* Rating / Like Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleLike(meme)}
                      disabled={ratingInProgress[meme.id]}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        meme.userLiked
                          ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                      }`}
                      title={
                        !session?.user
                          ? 'Sign in to like this meme'
                          : meme.userLiked
                          ? 'Click to unlike'
                          : 'Click to like'
                      }
                    >
                      <span className={meme.userLiked ? 'text-rose-500 scale-110' : 'text-gray-400'}>
                        {meme.userLiked ? '❤️' : '🤍'}
                      </span>
                      <span>{meme.likesCount}</span>
                      <span className="font-normal text-[11px]">
                        {meme.likesCount === 1 ? 'like' : 'likes'}
                      </span>
                    </button>

                    <div className="flex items-center gap-2.5">
                      {/* Delete Button for Owners */}
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => setMemeToDelete(meme)}
                          disabled={deletingId === meme.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer"
                          title="Delete your meme"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          <span>Delete</span>
                        </button>
                      )}

                      {/* Date */}
                      <span className="text-[11px] text-gray-400">
                        {new Date(meme.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {memeToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => !deletingId && setMemeToDelete(null)}
        >
          <div
            className="relative max-w-md w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600">
              <div className="rounded-full bg-red-100 p-2.5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Meme</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
              <p className="font-medium text-gray-900 line-clamp-2">
                &ldquo;{memeToDelete.caption}&rdquo;
              </p>
              {memeToDelete.likesCount > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  This meme has {memeToDelete.likesCount}{' '}
                  {memeToDelete.likesCount === 1 ? 'like' : 'likes'} which will also be removed.
                </p>
              )}
            </div>

            <p className="text-xs text-gray-600">
              Are you sure you want to permanently delete this meme? It will be immediately removed from the community feed.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setMemeToDelete(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deletingId ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Meme</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
