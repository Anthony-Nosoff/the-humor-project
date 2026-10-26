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
  const [memeTargetImage, setMemeTargetImage] = useState<DisplayImage | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
              onClick={() => setSelectedImage(image)}
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

              {/* Overlay with description and make meme button on hover */}
              {image.description && (
                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end">
                  <p className="text-xs text-white line-clamp-2 leading-snug mb-2">
                    {image.description}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMemeTargetImage(image);
                    }}
                    className="w-full text-center rounded bg-purple-600 hover:bg-purple-700 py-1 text-[11px] font-semibold text-white transition cursor-pointer shadow-xs"
                  >
                    🎭 Make meme
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Lightbox for full image and detailed summary */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => setSelectedImage(null)}
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
                  onClick={() => setSelectedImage(null)}
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

              <div className="text-xs text-gray-400">
                Uploaded: {new Date(selectedImage.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Make Meme Modal */}
      <MakeMemeModal
        isOpen={!!memeTargetImage}
        onClose={() => setMemeTargetImage(null)}
        image={memeTargetImage}
        onMemeCreated={() => {
          setToastMessage('Meme created successfully!');
          setTimeout(() => setToastMessage(null), 3500);
        }}
      />
    </div>
  );
}
