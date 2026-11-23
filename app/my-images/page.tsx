'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';
import MarkdownRenderer from '@/app/components/markdownRenderer';
import MakeMemeModal from '@/app/components/MakeMemeModal';
import { useUploadModal } from '@/app/context/UploadModalContext';

type ImageRow = Database['public']['Tables']['images']['Row'];
type MemeRow = Database['public']['Tables']['memes']['Row'];

interface DisplayImage extends ImageRow {
  displayUrl: string;
  memesCount: number;
}

export default function MyImagesPage() {
  const router = useRouter();
  const { openUploadModal } = useUploadModal();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<DisplayImage[]>([]);
  const [fetchingImages, setFetchingImages] = useState(false);

  // Sorting and filtering
  const [filterBy, setFilterBy] = useState<'all' | 'with-memes' | 'unused'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'most-memes'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected image for detailed inspection modal
  const [selectedImage, setSelectedImage] = useState<DisplayImage | null>(null);
  const [imageMemes, setImageMemes] = useState<MemeRow[]>([]);
  const [loadingImageMemes, setLoadingImageMemes] = useState(false);

  // Meme creation & deletion modals
  const [memeTargetImage, setMemeTargetImage] = useState<DisplayImage | null>(null);
  const [memeToDelete, setMemeToDelete] = useState<MemeRow | null>(null);
  const [deletingMemeId, setDeletingMemeId] = useState<string | null>(null);

  // Image deletion modal
  const [imageToDelete, setImageToDelete] = useState<DisplayImage | null>(null);
  const [imageMemesCountToDelete, setImageMemesCountToDelete] = useState<number | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);

  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchImageMemes = useCallback(async (imageId: string) => {
    setLoadingImageMemes(true);
    try {
      const { data, error } = await supabase
        .from('memes')
        .select('*')
        .eq('image_id', imageId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setImageMemes(data);
      } else {
        setImageMemes([]);
      }
    } catch (err) {
      console.error('Error fetching memes for image:', err);
      setImageMemes([]);
    } finally {
      setLoadingImageMemes(false);
    }
  }, []);

  const handleSelectImage = (img: DisplayImage) => {
    setSelectedImage(img);
    setImageMemes([]);
    fetchImageMemes(img.id);
  };

  const handleCloseImageDetails = () => {
    setSelectedImage(null);
    setImageMemes([]);
  };

  const handleDeleteMeme = async () => {
    if (!memeToDelete || !session?.access_token) return;
    setDeletingMemeId(memeToDelete.id);
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
        throw new Error(`Server returned HTTP ${res.status}: ${resText || res.statusText}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete meme');
      }

      setImageMemes((prev) => prev.filter((m) => m.id !== memeToDelete.id));
      setImages((prev) =>
        prev.map((img) =>
          img.id === memeToDelete.image_id
            ? { ...img, memesCount: Math.max(0, img.memesCount - 1) }
            : img
        )
      );
      showToast('Meme deleted successfully!');
      setMemeToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete meme';
      console.error('Error deleting meme:', err);
      showToast(msg);
    } finally {
      setDeletingMemeId(null);
    }
  };

  const handleRequestDeleteImage = async (img: DisplayImage) => {
    setImageToDelete(img);
    if (selectedImage?.id === img.id) {
      setImageMemesCountToDelete(imageMemes.length);
    } else {
      setImageMemesCountToDelete(img.memesCount);
    }
  };

  const handleConfirmDeleteImage = async () => {
    if (!imageToDelete || !session?.access_token) return;
    setDeletingImage(true);

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
        throw new Error(`Server returned HTTP ${res.status}: ${resText || res.statusText}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete image');
      }

      setImages((prev) => prev.filter((img) => img.id !== imageToDelete.id));
      if (selectedImage?.id === imageToDelete.id) {
        handleCloseImageDetails();
      }
      setImageToDelete(null);
      const memesCount = data.deletedMemesCount ?? 0;
      showToast(
        memesCount > 0
          ? `Image and ${memesCount} corresponding meme${memesCount === 1 ? '' : 's'} deleted.`
          : 'Image deleted successfully.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete image';
      console.error('Error deleting image:', err);
      showToast(msg);
    } finally {
      setDeletingImage(false);
    }
  };

  const loadUserImages = useCallback(async (userId: string) => {
    setFetchingImages(true);
    try {
      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('uploader_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user images:', error);
        setImages([]);
        return;
      }

      if (!data || data.length === 0) {
        setImages([]);
        return;
      }

      // Batch query meme counts for all images
      const imageIds = data.map((img) => img.id);
      const { data: memesData } = await supabase
        .from('memes')
        .select('id, image_id')
        .in('image_id', imageIds);

      const memesCountByImage: Record<string, number> = {};
      memesData?.forEach((m) => {
        if (m.image_id) {
          memesCountByImage[m.image_id] = (memesCountByImage[m.image_id] || 0) + 1;
        }
      });

      // Resolve display URLs for all images
      const resolvedImages: DisplayImage[] = await Promise.all(
        data.map(async (img) => {
          let displayUrl = '';
          if (img.url) {
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
                // fallback
              }

              if (!displayUrl) {
                const { data: publicData } = supabase.storage
                  .from('images')
                  .getPublicUrl(img.url);
                displayUrl = publicData.publicUrl;
              }
            }
          }

          return {
            ...img,
            displayUrl,
            memesCount: memesCountByImage[img.id] || 0,
          };
        })
      );

      setImages(resolvedImages);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setFetchingImages(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkSessionAndFetch = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!currentSession) {
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(currentSession);
      setLoading(false);
      await loadUserImages(currentSession.user.id);
    };

    checkSessionAndFetch();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      if (currentSession?.user) {
        loadUserImages(currentSession.user.id);
      } else {
        setImages([]);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, loadUserImages]);

  // Compute stats
  const withMemesCount = useMemo(
    () => images.filter((img) => img.memesCount > 0).length,
    [images]
  );
  const unusedCount = useMemo(
    () => images.filter((img) => img.memesCount === 0).length,
    [images]
  );

  // Filtered & Sorted Images
  const filteredImages = useMemo(() => {
    return images.filter((img) => {
      if (filterBy === 'with-memes' && img.memesCount === 0) return false;
      if (filterBy === 'unused' && img.memesCount > 0) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const desc = (img.description || '').toLowerCase();
        return desc.includes(query);
      }
      return true;
    });
  }, [images, filterBy, searchQuery]);

  const sortedImages = useMemo(() => {
    return [...filteredImages].sort((a, b) => {
      if (sortBy === 'most-memes') {
        if (b.memesCount !== a.memesCount) {
          return b.memesCount - a.memesCount;
        }
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filteredImages, sortBy]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
        <div className="h-8 bg-gray-200 rounded-lg w-1/4 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs space-y-3 animate-pulse"
            >
              <div className="aspect-square w-full bg-gray-200 rounded-lg" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Unauthenticated state (matching Explore & Profile)
  if (!session) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-2xs space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-3xl shadow-2xs">
            🔒
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Sign in Required</h2>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Please log in to view and manage your uploaded images, visual summaries, and memes.
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

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-lg flex items-center gap-2 animate-fade-in">
          <span>🔔</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header section (matching Explore page) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <span>My Images</span>
          </h1>
        </div>

        <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center justify-end gap-3 min-w-0">
          {/* Search Input Bar */}
          {images.length > 0 && (
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search images by visual context or AI summary..."
                className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-8 py-2 text-xs text-gray-900 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-2xs transition"
              />
              <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs p-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          )}
      
          {/* Feed Filter: All vs With Memes vs Unused */}
          <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setFilterBy('all')}
              className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                filterBy === 'all'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All ({images.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterBy('with-memes')}
              className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                filterBy === 'with-memes'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              With Memes ({withMemesCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterBy('unused')}
              className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                filterBy === 'unused'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Unused ({unusedCount})
            </button>
          </div>

          {/* Sort Selector: Newest vs Most Memes */}
          <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-2xs">
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
              onClick={() => setSortBy('most-memes')}
              className={`rounded px-3 py-1.5 font-medium transition cursor-pointer ${
                sortBy === 'most-memes'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🎭 Most Memes
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {fetchingImages ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs space-y-3 animate-pulse"
            >
              <div className="aspect-square w-full bg-gray-200 rounded-lg" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : sortedImages.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center bg-gray-50">
          <span className="text-4xl">🖼️</span>
          <h3 className="mt-3 text-base font-semibold text-gray-900">
            {searchQuery
              ? 'No matching images found'
              : filterBy === 'with-memes'
              ? 'No images with memes yet'
              : filterBy === 'unused'
              ? 'All of your images currently have memes!'
              : 'No images in your library yet'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? 'Try modifying your search query or clear the filter.'
              : filterBy === 'with-memes'
              ? 'Select any image and click "Make meme" to generate your first community meme.'
              : 'Upload an image to start generating Gemini multimodal summaries and AI memes!'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {searchQuery || filterBy !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterBy('all');
                }}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Reset Filters
              </button>
            ) : null}
            <button
              type="button"
              onClick={openUploadModal}
              className="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-purple-700 transition cursor-pointer"
            >
              + Upload Image
            </button>
            <Link
              href="/"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Explore Memes &rarr;
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedImages.map((image) => {
            const uploadDate = new Date(image.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={image.id}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xs hover:shadow-md hover:border-purple-300 transition overflow-hidden"
              >
                {/* Image Container (matching Explore aspect-square styling) */}
                <div
                  onClick={() => handleSelectImage(image)}
                  className="relative aspect-square w-full bg-gray-900 overflow-hidden flex items-center justify-center cursor-pointer"
                >
                  {/* Date Uploaded Pill */}
                  <div className="absolute top-2.5 left-2.5 z-10 rounded-full bg-black/60 text-white px-2 py-0.5 text-[10px] font-medium tracking-wide backdrop-blur-xs">
                    {uploadDate}
                  </div>

                  {/* Meme Count Badge */}
                  <div className="absolute top-2.5 right-2.5 z-10">
                    {image.memesCount > 0 ? (
                      <span className="rounded-full bg-purple-600 text-white px-2.5 py-0.5 text-[10px] font-bold tracking-wide backdrop-blur-xs shadow-xs flex items-center gap-1">
                        <span>🎭</span>
                        <span>{image.memesCount} {image.memesCount === 1 ? 'meme' : 'memes'}</span>
                      </span>
                    ) : (
                      <span className="rounded-full bg-black/50 text-gray-300 px-2 py-0.5 text-[10px] font-medium backdrop-blur-xs">
                        No memes
                      </span>
                    )}
                  </div>

                  {image.displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.displayUrl}
                      alt={image.description || 'Uploaded image'}
                      className="h-full w-full object-contain p-2 group-hover:scale-[1.02] transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-gray-400 text-xs">Image preview unavailable</div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                  {/* AI Summary Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                        <span>✨</span>
                        <span>Gemini AI Summary</span>
                      </span>
                    </div>

                    {image.description ? (
                      <p
                        onClick={() => handleSelectImage(image)}
                        className="text-xs text-gray-700 line-clamp-3 leading-relaxed cursor-pointer hover:text-gray-900 transition"
                        title="Click to view full summary and memes"
                      >
                        {image.description}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        No AI description generated yet.
                      </p>
                    )}
                  </div>

                  {/* Card Action Controls */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMemeTargetImage(image);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition cursor-pointer"
                      >
                        <span>Make meme</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRequestDeleteImage(image);
                      }}
                      className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer"
                      title="Delete image entirely"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Lightbox for Full Image, Gemini Summary, and Associated Memes */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={handleCloseImageDetails}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">🖼️</span>
                <h3 className="text-sm font-bold text-gray-900">Image Details & Memes</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMemeTargetImage(selectedImage)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition cursor-pointer shadow-xs"
                >
                  <span>🎭</span>
                  <span>Make meme</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestDeleteImage(selectedImage)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer"
                  title="Delete image entirely"
                >
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={handleCloseImageDetails}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto p-5 space-y-4">
              <div className="flex justify-center bg-gray-950 rounded-xl overflow-hidden max-h-[50vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImage.displayUrl}
                  alt={selectedImage.description || 'Uploaded image'}
                  className="max-h-[50vh] max-w-full object-contain p-2"
                />
              </div>

              {selectedImage.description ? (
                <div className="rounded-xl bg-purple-50/60 border border-purple-200 p-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 uppercase tracking-wide">
                    <span>✨</span>
                    <span>Gemini AI Visual Summary</span>
                  </div>
                  <MarkdownRenderer
                    content={selectedImage.description}
                    className="text-purple-950 text-xs leading-relaxed"
                  />
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-xs text-gray-500 italic">
                  No AI summary generated for this image yet.
                </div>
              )}

              {/* Memes created from this image */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🎭</span>
                    <span>Memes created from this image ({imageMemes.length})</span>
                  </h4>
                </div>

                {loadingImageMemes ? (
                  <p className="text-xs text-gray-400">Loading memes...</p>
                ) : imageMemes.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">
                    No memes have been made with this image yet. Click &ldquo;Make meme&rdquo; to create one!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {imageMemes.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-2xs text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-xs line-clamp-2">
                            &ldquo;{m.caption}&rdquo;
                          </p>
                          <span className="text-[10px] text-gray-400 mt-0.5 block">
                            Created {new Date(m.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMemeToDelete(m)}
                          disabled={deletingMemeId === m.id}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-gray-400">
                Uploaded: {new Date(selectedImage.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Meme Confirmation Modal */}
      {memeToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => !deletingMemeId && setMemeToDelete(null)}
        >
          <div
            className="relative max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600">
              <div className="rounded-xl bg-red-100 p-2.5">
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
                <h3 className="text-base font-bold text-gray-900">Delete Meme</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700">
              <p className="font-medium text-gray-900 line-clamp-2">
                &ldquo;{memeToDelete.caption}&rdquo;
              </p>
            </div>

            <p className="text-xs text-gray-600">
              Are you sure you want to delete this meme? It will be removed from your images and the community Explore feed.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={Boolean(deletingMemeId)}
                onClick={() => setMemeToDelete(null)}
                className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingMemeId)}
                onClick={handleDeleteMeme}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deletingMemeId ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
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

      {/* Delete Image Confirmation Modal */}
      {imageToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => !deletingImage && setImageToDelete(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600">
              <div className="rounded-xl bg-red-100 p-2.5 flex-shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Image Entirely?</h3>
                <p className="text-xs text-red-600 font-medium">Warning: This action is permanent and cannot be undone.</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium pb-1">
                Deleting this image will <strong>permanently delete</strong>:
              </p>
              <ul className="text-xs list-disc list-inside space-y-0.5 pl-1">
                <li>The uploaded image storage file and its Gemini summary</li>
                <li>
                  <strong>ALL corresponding memes</strong> created from this image
                  {imageMemesCountToDelete !== null && imageMemesCountToDelete > 0
                    ? ` (${imageMemesCountToDelete} meme${imageMemesCountToDelete === 1 ? '' : 's'})`
                    : ''}
                </li>
                <li>All community ratings and likes on those memes</li>
              </ul>
            </div>

            {imageToDelete.displayUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
                <div className="h-14 w-14 bg-gray-950 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageToDelete.displayUrl}
                    alt="Preview"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400 font-medium">Uploaded Image Asset</p>
                  <p className="text-xs text-gray-800 line-clamp-2 mt-0.5">
                    {imageToDelete.description || 'No description'}
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-600">
              Are you sure you want to proceed? None of this content can be recovered once deleted.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deletingImage}
                onClick={() => setImageToDelete(null)}
                className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingImage}
                onClick={handleConfirmDeleteImage}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deletingImage ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Deleting Image & Memes...</span>
                  </>
                ) : (
                  <span>Delete Image & All Corresponding Memes</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Make Meme Modal */}
      <MakeMemeModal
        isOpen={!!memeTargetImage}
        onClose={() => setMemeTargetImage(null)}
        image={memeTargetImage}
        onMemeCreated={(newMeme) => {
          showToast('Meme created successfully! 🎉');
          if (selectedImage?.id === newMeme.image_id) {
            setImageMemes((prev) => [newMeme, ...prev]);
          }
          setImages((prev) =>
            prev.map((img) =>
              img.id === newMeme.image_id
                ? { ...img, memesCount: img.memesCount + 1 }
                : img
            )
          );
        }}
      />
    </div>
  );
}
