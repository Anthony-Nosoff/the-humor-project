'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';
import MarkdownRenderer from '@/app/components/markdownRenderer';
import MakeMemeModal from '@/app/components/MakeMemeModal';

type ImageRow = Database['public']['Tables']['images']['Row'];

interface DisplayImage extends ImageRow {
  displayUrl: string;
}

export default function MyImagesPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<DisplayImage[]>([]);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState<DisplayImage | null>(null);
  const [imageMemes, setImageMemes] = useState<Database['public']['Tables']['memes']['Row'][]>([]);
  const [loadingImageMemes, setLoadingImageMemes] = useState(false);
  const [memeTargetImage, setMemeTargetImage] = useState<DisplayImage | null>(null);
  const [memeToDelete, setMemeToDelete] = useState<Database['public']['Tables']['memes']['Row'] | null>(null);
  const [deletingMemeId, setDeletingMemeId] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<DisplayImage | null>(null);
  const [imageMemesCountToDelete, setImageMemesCountToDelete] = useState<number | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
      setToastMessage('Meme deleted successfully!');
      setTimeout(() => setToastMessage(null), 3000);
      setMemeToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete meme';
      console.error('Error deleting meme:', err);
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setDeletingMemeId(null);
    }
  };

  const handleRequestDeleteImage = async (img: DisplayImage) => {
    setImageToDelete(img);
    if (selectedImage?.id === img.id) {
      setImageMemesCountToDelete(imageMemes.length);
    } else {
      try {
        const { count } = await supabase
          .from('memes')
          .select('*', { count: 'exact', head: true })
          .eq('image_id', img.id);
        setImageMemesCountToDelete(count ?? null);
      } catch {
        setImageMemesCountToDelete(null);
      }
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
      setToastMessage(
        memesCount > 0
          ? `Image and ${memesCount} corresponding meme${memesCount === 1 ? '' : 's'} deleted.`
          : 'Image deleted successfully.'
      );
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete image';
      console.error('Error deleting image:', err);
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3500);
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

      // Resolve displayable URLs for each image
      const resolvedImages: DisplayImage[] = await Promise.all(
        data.map(async (img) => {
          if (!img.url) {
            return { ...img, displayUrl: '' };
          }

          if (img.url.startsWith('http://') || img.url.startsWith('https://')) {
            return { ...img, displayUrl: img.url };
          }

          // Try signed URL in case bucket is private
          try {
            const { data: signedData, error: signedError } = await supabase.storage
              .from('images')
              .createSignedUrl(img.url, 3600);

            if (!signedError && signedData?.signedUrl) {
              return { ...img, displayUrl: signedData.signedUrl };
            }
          } catch (e) {
            console.warn('Could not generate signed URL, using public URL fallback', e);
          }

          // Fallback to public URL
          const { data: publicData } = supabase.storage
            .from('images')
            .getPublicUrl(img.url);

          return { ...img, displayUrl: publicData.publicUrl };
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-xs">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign in required</h2>
          <p className="text-gray-600 mb-6 text-sm">
            Please log in to view your uploaded images.
          </p>
          <Link
            href="/"
            className="inline-block rounded bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 transition"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-lg flex items-center gap-2">
          <span>🎉</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Images</h1>
          <p className="text-sm text-gray-500 mt-1">
            {images.length} {images.length === 1 ? 'image' : 'images'} uploaded
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-2xs hover:bg-blue-700 transition"
        >
          + Upload New Image
        </Link>
      </div>

      {fetchingImages ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square bg-gray-200 animate-pulse rounded-lg border border-gray-100"
            />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center bg-gray-50">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3 className="mt-2 text-base font-semibold text-gray-900">No images yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by uploading your first image to generate a Gemini summary.
          </p>
          <div className="mt-6">
            <Link
              href="/upload"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-2xs hover:bg-blue-700 transition"
            >
              Upload Image
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              onClick={() => handleSelectImage(image)}
              className="group relative aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shadow-2xs hover:shadow-md transition cursor-pointer"
            >
              {image.displayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.displayUrl}
                  alt={image.description || 'Uploaded meme image'}
                  className="absolute inset-0 h-full w-full object-contain p-1.5 group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                  No preview
                </div>
              )}


              {/* AI Summary Badge */}
              {image.description && (
                <div className="absolute top-2 right-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                  AI Summary
                </div>
              )}

              {/* Overlay with description and action buttons on hover */}
              <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
                {image.description && (
                  <p className="text-xs text-white line-clamp-2 leading-snug mb-2">
                    {image.description}
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMemeTargetImage(image);
                    }}
                    className="flex-1 text-center rounded bg-purple-600 hover:bg-purple-700 py-1 text-[11px] font-semibold text-white transition cursor-pointer shadow-xs"
                  >
                    🎭 Make meme
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRequestDeleteImage(image);
                    }}
                    className="rounded bg-red-600/90 hover:bg-red-700 p-1 text-white transition cursor-pointer shadow-xs"
                    title="Delete image entirely"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Lightbox for full image and detailed summary */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={handleCloseImageDetails}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-900">Image Details</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMemeTargetImage(selectedImage);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition cursor-pointer shadow-xs"
                >
                  <span>🎭</span>
                  <span>Make meme</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestDeleteImage(selectedImage)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer shadow-xs"
                  title="Delete image entirely"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Delete Image</span>
                </button>
                <button
                  type="button"
                  onClick={handleCloseImageDetails}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              <div className="flex justify-center bg-gray-900 rounded-lg overflow-hidden max-h-[55vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImage.displayUrl}
                  alt={selectedImage.description || 'Uploaded image'}
                  className="max-h-[55vh] max-w-full object-contain"
                />
              </div>

              {selectedImage.description ? (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                  <h4 className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">
                    Gemini AI Summary
                  </h4>
                  <MarkdownRenderer
                    content={selectedImage.description}
                    className="text-blue-950 leading-relaxed"
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">
                  No summary generated for this image yet.
                </p>
              )}

              {/* Memes created from this image */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                    Memes created from this image ({imageMemes.length})
                  </h4>
                </div>

                {loadingImageMemes ? (
                  <p className="text-xs text-gray-400">Loading memes...</p>
                ) : imageMemes.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">
                    No memes have been made with this image yet. Click &ldquo;Make meme&rdquo; above to create one!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {imageMemes.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-2xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm line-clamp-2">
                            &ldquo;{m.caption}&rdquo;
                          </p>
                          <span className="text-[11px] text-gray-400">
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
                          className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-400">
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
            </div>

            <p className="text-xs text-gray-600">
              Are you sure you want to delete this meme? It will be removed from your images and the community memes feed.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={Boolean(deletingMemeId)}
                onClick={() => setMemeToDelete(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingMemeId)}
                onClick={handleDeleteMeme}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deletingMemeId ? (
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

      {/* Delete Image Entirely Confirmation Modal with Prominent Warning */}
      {imageToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => !deletingImage && setImageToDelete(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 text-red-600">
              <div className="rounded-full bg-red-100 p-2.5 flex-shrink-0">
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
                <h3 className="text-lg font-bold text-gray-900">Delete Image Entirely?</h3>
                <p className="text-xs text-red-600 font-medium">Warning: This action is permanent and cannot be undone.</p>
              </div>
            </div>

            {/* Thumbnail preview */}
            {imageToDelete.displayUrl && (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                <div className="h-16 w-16 bg-gray-900 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageToDelete.displayUrl}
                    alt="Preview"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium">Uploaded Image</p>
                  <p className="text-xs text-gray-800 line-clamp-2 mt-0.5">
                    {imageToDelete.description || 'No description'}
                  </p>
                </div>
              </div>
            )}

            {/* Prominent Warning Callout */}
            <div className="rounded-lg border-2 border-red-200 bg-red-50 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                <span>⚠️ Important Warning</span>
              </div>
              <p className="text-xs text-red-900 leading-relaxed">
                Deleting this image will <strong>permanently delete</strong>:
              </p>
              <ul className="text-xs text-red-800 list-disc list-inside space-y-0.5 pl-1">
                <li>The uploaded image file and its Gemini summary</li>
                <li>
                  <strong>ALL corresponding memes</strong> created from this image
                  {imageMemesCountToDelete !== null && imageMemesCountToDelete > 0
                    ? ` (${imageMemesCountToDelete} meme${imageMemesCountToDelete === 1 ? '' : 's'})`
                    : ''}
                </li>
                <li>All community ratings and likes on those memes</li>
              </ul>
            </div>

            <p className="text-xs text-gray-600">
              Are you sure you want to proceed? None of this content can be recovered once deleted.
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deletingImage}
                onClick={() => setImageToDelete(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingImage}
                onClick={handleConfirmDeleteImage}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deletingImage ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
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
          setToastMessage('Meme created successfully!');
          setTimeout(() => setToastMessage(null), 3500);
          if (selectedImage?.id === newMeme.image_id) {
            setImageMemes((prev) => [newMeme, ...prev]);
          }
        }}
      />
    </div>
  );
}
