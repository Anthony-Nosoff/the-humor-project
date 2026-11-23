'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import MarkdownRenderer from '@/app/components/markdownRenderer';
import MakeMemeModal from '@/app/components/MakeMemeModal';

interface UploadImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageUploaded?: (image: {
    id: string;
    url: string;
    displayUrl: string;
    description: string;
  }) => void;
}

interface UploadedImageState {
  id: string;
  url: string;
  displayUrl: string;
  description: string;
}

export default function UploadImageModal({
  isOpen,
  onClose,
  onImageUploaded,
}: UploadImageModalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Form states
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [triggerGemini, setTriggerGemini] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Upload progress states
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Successful result states
  const [uploadedImage, setUploadedImage] = useState<UploadedImageState | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isMemeModalOpen, setIsMemeModalOpen] = useState(false);
  const [memeSuccess, setMemeSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load session
  useEffect(() => {
    let isMounted = true;
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(session);
      setLoadingSession(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      setLoadingSession(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Keyboard escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !uploading) {
        handleModalClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, uploading]);

  // Handle file preview URL cleanup
  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const handleModalClose = () => {
    if (uploading) return;
    setFile(null);
    setDescription('');
    setError(null);
    setUploadedImage(null);
    setSummary(null);
    setMemeSuccess(false);
    onClose();
  };

  const handleResetForAnother = () => {
    setFile(null);
    setDescription('');
    setError(null);
    setUploadedImage(null);
    setSummary(null);
    setMemeSuccess(false);
  };

  const handleFileChange = (newFile: File | null) => {
    if (!newFile) return;
    if (!newFile.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP, GIF).');
      return;
    }
    setError(null);
    setFile(newFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user) {
      setError('You must be signed in to upload.');
      return;
    }

    if (!file) {
      setError('Please select an image file to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    setStatusText('Uploading image file to storage...');

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

      // 1. Upload to Supabase Storage 'images' bucket
      const { data: storageData, error: storageError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (storageError) {
        throw new Error(`Upload to storage failed: ${storageError.message}`);
      }

      // 2. Insert into public.images table
      setStatusText('Recording image in database...');
      const { data: imageRow, error: dbError } = await supabase
        .from('images')
        .insert({
          url: storageData.path,
          uploader_id: session.user.id,
          description: description.trim() || null,
        })
        .select()
        .single();

      if (dbError || !imageRow) {
        throw new Error(`Failed to record database entry: ${dbError?.message}`);
      }

      let generatedSummary = description.trim();

      // 3. Optional: Trigger Gemini multimodal visual summarization
      if (triggerGemini) {
        setStatusText('Generating Gemini AI visual summary...');
        try {
          const summarizeRes = await fetch('/api/images/summarize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {}),
            },
            body: JSON.stringify({
              imageId: imageRow.id,
              imagePath: storageData.path,
              mimeType: file.type || 'image/jpeg',
            }),
          });

          const responseText = await summarizeRes.text();
          let summarizeResult;
          try {
            summarizeResult = JSON.parse(responseText);
          } catch {
            // non-fatal json parse
          }

          if (summarizeRes.ok && summarizeResult?.summary) {
            generatedSummary = summarizeResult.summary;
            setSummary(generatedSummary);
          }
        } catch (sumErr) {
          console.warn('Gemini summary request failed:', sumErr);
        }
      }

      // 4. Resolve display URL
      let displayUrl = '';
      try {
        const { data: signedData } = await supabase.storage
          .from('images')
          .createSignedUrl(storageData.path, 3600);
        if (signedData?.signedUrl) {
          displayUrl = signedData.signedUrl;
        }
      } catch {
        // fallback
      }

      if (!displayUrl) {
        const { data: pubData } = supabase.storage
          .from('images')
          .getPublicUrl(storageData.path);
        displayUrl = pubData.publicUrl;
      }

      const uploadedResult: UploadedImageState = {
        id: imageRow.id,
        url: storageData.path,
        displayUrl,
        description: generatedSummary,
      };

      setUploadedImage(uploadedResult);
      if (onImageUploaded) {
        onImageUploaded(uploadedResult);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error during upload';
      console.error('Error during image upload:', err);
      setError(msg);
    } finally {
      setUploading(false);
      setStatusText('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-fade-in"
      onClick={handleModalClose}
    >
      <div
        className="relative max-w-lg w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-base shadow-2xs">
              🖼️
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                {uploadedImage ? 'Image Ready!' : 'Upload New Image'}
              </h3>
              <p className="text-[11px] text-gray-500">
                {uploadedImage
                  ? 'Your image has been uploaded to your library.'
                  : 'Add an image to your library with automatic Gemini AI summarization.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={handleModalClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer disabled:opacity-50"
            title="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-6 space-y-4">
          {loadingSession ? (
            <div className="py-12 text-center text-xs text-gray-500 animate-pulse">
              Checking authentication...
            </div>
          ) : !session?.user ? (
            /* Unauthenticated Prompt */
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-2xl shadow-2xs">
                🔒
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-gray-900">Sign in to Upload Images</h4>
                <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                  You need an active session to upload images, generate AI visual summaries, and create community memes.
                </p>
              </div>
              <div className="flex justify-center gap-2.5 pt-2">
                <Link
                  href="/login"
                  onClick={handleModalClose}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition"
                >
                  Sign In / Register
                </Link>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : uploadedImage ? (
            /* Success State after upload */
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 flex items-center justify-between text-xs text-emerald-900 font-medium">
                <div className="flex items-center gap-2">
                  <span>🎉</span>
                  <span>Upload completed successfully!</span>
                </div>
                <Link
                  href="/my-images"
                  onClick={handleModalClose}
                  className="text-emerald-700 font-bold hover:underline text-[11px]"
                >
                  View in My Images &rarr;
                </Link>
              </div>

              {/* Uploaded Thumbnail */}
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="h-16 w-16 bg-gray-950 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedImage.displayUrl}
                    alt="Uploaded thumbnail"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-purple-700">Uploaded Image Asset</p>
                  <p className="text-xs text-gray-800 line-clamp-2 mt-0.5">
                    {uploadedImage.description || 'No description provided'}
                  </p>
                </div>
              </div>

              {/* Gemini AI Summary Card */}
              {summary && (
                <div className="rounded-xl bg-purple-50/60 border border-purple-200 p-4 space-y-1.5">
                  <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1">
                    <span>✨</span>
                    <span>Gemini AI Visual Summary</span>
                  </span>
                  <MarkdownRenderer
                    content={summary}
                    className="text-purple-950 text-xs leading-relaxed"
                  />
                </div>
              )}

              {memeSuccess && (
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 font-medium flex items-center justify-between">
                  <span>🎭 Meme created successfully!</span>
                  <Link
                    href="/"
                    onClick={handleModalClose}
                    className="font-bold underline text-purple-700"
                  >
                    View in Explore &rarr;
                  </Link>
                </div>
              )}

              {/* Post-Upload Actions */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMemeModalOpen(true)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition cursor-pointer"
                >
                  <span>🎭</span>
                  <span>Turn into Meme</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetForAnother}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  Upload Another
                </button>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Upload Form */
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Drag-and-drop Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Select Image File <span className="text-red-500">*</span>
                </label>

                {filePreview ? (
                  /* Selected File Preview Box */
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14 h-14 bg-gray-950 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={filePreview}
                          alt="Selected file preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {file?.name}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {file ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => setFile(null)}
                      className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition text-xs font-bold"
                      title="Remove selected file"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  /* Empty Dropzone */
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                      isDragging
                        ? 'border-purple-600 bg-purple-50/50'
                        : 'border-gray-300 hover:border-purple-400 bg-gray-50/50 hover:bg-purple-50/20'
                    }`}
                  >
                    <span className="text-3xl block mb-1.5">📸</span>
                    <p className="text-xs font-bold text-gray-900">
                      Click to browse or drag and drop an image
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Supports PNG, JPG, WebP, GIF (up to 10MB)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </div>
                )}
              </div>

              {/* Initial Description Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Initial Description or Context <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={uploading}
                  placeholder="Subject, setting, or notable visual cues..."
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs text-gray-900 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition disabled:opacity-50"
                />
              </div>

              {/* Gemini AI Summarization Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-700 pt-1">
                <input
                  type="checkbox"
                  checked={triggerGemini}
                  onChange={(e) => setTriggerGemini(e.target.checked)}
                  disabled={uploading}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold text-gray-900">
                    Automatically generate Gemini AI visual summary
                  </span>
                  <p className="text-[11px] text-gray-500">
                    AI analyzes subjects, facial expressions, and humorous cues for future meme captions.
                  </p>
                </div>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleModalClose}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {uploading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>{statusText || 'Uploading...'}</span>
                    </>
                  ) : (
                    <span>Upload Image</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Make Meme Modal (if user chooses to create meme right away) */}
      <MakeMemeModal
        isOpen={isMemeModalOpen}
        onClose={() => setIsMemeModalOpen(false)}
        image={uploadedImage}
        onMemeCreated={() => {
          setMemeSuccess(true);
        }}
      />
    </div>
  );
}
