'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';
import MarkdownRenderer from '@/app/components/markdownRenderer';
import { useUploadModal } from '@/app/context/UploadModalContext';

type MemeRow = Database['public']['Tables']['memes']['Row'];
type ImageRow = Database['public']['Tables']['images']['Row'];
type MemeRatingRow = Database['public']['Tables']['meme_ratings']['Row'];

interface EnrichedMeme extends MemeRow {
  image?: ImageRow | null;
  displayUrl: string;
  likesCount: number;
  userLiked: boolean;
}

export default function ExplorePage() {
  const { openUploadModal } = useUploadModal();
  const [session, setSession] = useState<Session | null>(null);
  const [memes, setMemes] = useState<EnrichedMeme[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'most-liked'>('newest');
  const [filterBy, setFilterBy] = useState<'all' | 'mine'>('all');
  const [ratingInProgress, setRatingInProgress] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [memeToDelete, setMemeToDelete] = useState<EnrichedMeme | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMeme, setSelectedMeme] = useState<EnrichedMeme | null>(null);

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
                // Ignore storage error, fallback to public url
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
          const userLiked = Boolean(
            currentUserId && memeRatings.some((r) => r.user_id === currentUserId && r.liked)
          );

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
      console.error('Error enriching memes:', err);
      setMemes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Check initial auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setSession(session);
        fetchMemes(session?.user?.id);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setSession(session);
        fetchMemes(session?.user?.id);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchMemes]);

  const handleToggleLike = async (meme: EnrichedMeme) => {
    if (!session?.user) {
      setToastMessage('Please sign in to rate memes!');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    if (ratingInProgress[meme.id]) return;

    setRatingInProgress((prev) => ({ ...prev, [meme.id]: true }));

    const previousLiked = meme.userLiked;
    const nextLiked = !previousLiked;
    const previousLikesCount = meme.likesCount;
    const nextLikesCount = nextLiked ? previousLikesCount + 1 : Math.max(0, previousLikesCount - 1);

    // Optimistic UI update
    setMemes((prev) =>
      prev.map((m) =>
        m.id === meme.id
          ? { ...m, userLiked: nextLiked, likesCount: nextLikesCount }
          : m
      )
    );

    try {
      if (nextLiked) {
        // User is liking the meme
        const response = await fetch('/api/memes/rate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            memeId: meme.id,
            liked: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to submit rating');
        }
      } else {
        // User is unliking - delete their rating from the table
        const { error: deleteError } = await supabase
          .from('meme_ratings')
          .delete()
          .match({ meme_id: meme.id, user_id: session.user.id });

        if (deleteError) {
          // If delete fails, attempt to update liked to false via API
          const response = await fetch('/api/memes/rate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              memeId: meme.id,
              liked: false,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to remove like');
          }
        }
      }
    } catch (err) {
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

  const activeSelectedMeme = selectedMeme
    ? memes.find((m) => m.id === selectedMeme.id) || selectedMeme
    : null;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-lg flex items-center gap-2 animate-fade-in">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Explore Memes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse, rate, and discover humorous memes created by the community.
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

          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex items-center justify-center rounded-md bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition cursor-pointer"
          >
            + Make a Meme
          </button>
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
            <button
              type="button"
              onClick={openUploadModal}
              className="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-purple-700 transition cursor-pointer"
            >
              Upload & Make Meme
            </button>
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
                <div
                  onClick={() => setSelectedMeme(meme)}
                  className="relative aspect-square w-full bg-gray-900 overflow-hidden flex items-center justify-center cursor-pointer"
                >
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

                {/* Meme Card Action Controls */}
                <div className="p-3.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
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
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Date */}
                    <span className="text-[11px] text-gray-400">
                      {new Date(meme.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>

                    {/* Delete Button for Owners (formatted same as My Images) */}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setMemeToDelete(meme)}
                        disabled={deletingId === meme.id}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer"
                        title="Delete your meme"
                      >
                        <svg
                          className="w-4 h-4"
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
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Window Modal (similar to My Images details window) */}
      {activeSelectedMeme && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => setSelectedMeme(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎭</span>
                <h3 className="text-sm font-bold text-gray-900">Meme Details</h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Like Button */}
                <button
                  type="button"
                  onClick={() => handleToggleLike(activeSelectedMeme)}
                  disabled={ratingInProgress[activeSelectedMeme.id]}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    activeSelectedMeme.userLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                  }`}
                  title={
                    !session?.user
                      ? 'Sign in to like this meme'
                      : activeSelectedMeme.userLiked
                      ? 'Click to unlike'
                      : 'Click to like'
                  }
                >
                  <span className={activeSelectedMeme.userLiked ? 'text-rose-500 scale-110' : 'text-gray-400'}>
                    {activeSelectedMeme.userLiked ? '❤️' : '🤍'}
                  </span>
                  <span>{activeSelectedMeme.likesCount}</span>
                  <span className="font-normal text-[11px]">
                    {activeSelectedMeme.likesCount === 1 ? 'like' : 'likes'}
                  </span>
                </button>

                {/* Delete Button for Owners */}
                {session?.user?.id && activeSelectedMeme.image?.uploader_id === session.user.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setMemeToDelete(activeSelectedMeme);
                      setSelectedMeme(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer"
                    title="Delete meme"
                  >
                    <span>Delete</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedMeme(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-5 space-y-4">
              {/* Image Preview with Caption */}
              <div className="flex justify-center bg-gray-950 rounded-xl overflow-hidden max-h-[50vh] relative">
                {activeSelectedMeme.displayUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeSelectedMeme.displayUrl}
                    alt={activeSelectedMeme.caption || 'Meme image'}
                    className="max-h-[50vh] max-w-full object-contain p-2"
                  />
                ) : (
                  <div className="text-gray-400 text-xs p-12">Image unavailable</div>
                )}
                {activeSelectedMeme.caption && (
                  <div className="absolute inset-x-0 bottom-4 px-4 text-center pointer-events-none">
                    <span className="inline-block bg-black/80 text-white font-black text-sm sm:text-base px-3 py-1.5 rounded uppercase tracking-wide leading-tight shadow-lg backdrop-blur-2xs">
                      {activeSelectedMeme.caption}
                    </span>
                  </div>
                )}
              </div>

              {/* Caption Section */}
              <div className="rounded-xl bg-purple-50/60 border border-purple-200 p-4 space-y-1">
                <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider block">
                  Meme Caption
                </span>
                <p className="text-base font-bold text-gray-900 leading-snug">
                  &ldquo;{activeSelectedMeme.caption}&rdquo;
                </p>
              </div>

              {/* Context / Gemini Summary Section */}
              {activeSelectedMeme.image?.description ? (
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-1.5">
                  <span className="text-[10px] font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1">
                    <span>✨</span>
                    <span>Image Context & Gemini Summary</span>
                  </span>
                  <MarkdownRenderer
                    content={activeSelectedMeme.image.description}
                    className="text-gray-700 text-xs leading-relaxed"
                  />
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-xs text-gray-400 italic">
                  No visual context or summary available for this image.
                </div>
              )}

              {/* Metadata Footer */}
              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-100">
                <span>
                  Created on {new Date(activeSelectedMeme.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span className="flex items-center gap-1 text-rose-600 font-semibold">
                  <span>❤️</span>
                  <span>{activeSelectedMeme.likesCount} {activeSelectedMeme.likesCount === 1 ? 'like' : 'likes'}</span>
                </span>
              </div>
            </div>
          </div>
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
