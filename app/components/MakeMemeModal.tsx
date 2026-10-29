'use client';

import { useState } from 'react';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Memes } from '@/app/supabase/types';

interface MakeMemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: {
    id: string;
    url?: string | null;
    displayUrl?: string | null;
    description?: string | null;
  } | null;
  onMemeCreated?: (meme: Memes) => void;
}

export default function MakeMemeModal({
  isOpen,
  onClose,
  image,
  onMemeCreated,
}: MakeMemeModalProps) {
  const [caption, setCaption] = useState('');
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [savingMeme, setSavingMeme] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClose = () => {
    setCaption('');
    setError(null);
    setSuccess(null);
    setGeneratingCaption(false);
    setSavingMeme(false);
    onClose();
  };

  if (!isOpen || !image) {
    return null;
  }

  const handleGenerateCaption = async () => {
    if (!image.id) return;
    setGeneratingCaption(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/memes/generate-caption', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          imageId: image.id,
          description: image.description || undefined,
          imagePath: image.url || undefined,
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
        throw new Error(data.error || 'Failed to generate caption with Gemini');
      }

      setCaption(data.caption);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error generating caption';
      console.error('Gemini caption generation error:', errMsg);
      setError(errMsg);
    } finally {
      setGeneratingCaption(false);
    }
  };

  const handleCreateMeme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim()) {
      setError('Please enter a caption or generate one with Gemini.');
      return;
    }

    setSavingMeme(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/memes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          imageId: image.id,
          caption: caption.trim(),
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
        throw new Error(data.error || 'Failed to save meme');
      }

      const newMeme = data.meme as Memes;
      setSuccess('Meme created successfully!');
      if (onMemeCreated) {
        onMemeCreated(newMeme);
      }

      // Automatically close modal after brief confirmation
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error saving meme';
      console.error('Error creating meme:', errMsg);
      setError(errMsg);
    } finally {
      setSavingMeme(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={handleClose}
    >
      <div
        className="relative max-w-2xl w-full bg-white rounded-xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎭</span>
            <h3 className="text-base font-semibold text-gray-900">Make Meme</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <span className="sr-only">Close</span>
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3 text-xs text-green-700 flex items-center gap-2">
              <span>✓</span>
              <span>{success}</span>
            </div>
          )}

          {/* Meme Preview */}
          <div className="rounded-lg bg-gray-900 p-3 overflow-hidden flex flex-col items-center justify-center relative min-h-[220px] max-h-[42vh]">
            {image.displayUrl ? (
              <div className="relative inline-block max-w-full max-h-[38vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.displayUrl}
                  alt={image.description || 'Meme candidate image'}
                  className="max-h-[38vh] max-w-full object-contain rounded"
                />
                {/* Live Caption Overlay Preview */}
                {caption.trim() && (
                  <div className="absolute inset-x-0 bottom-2 px-3 text-center pointer-events-none">
                    <span className="inline-block bg-black/75 text-white font-extrabold text-sm sm:text-base px-3 py-1 rounded shadow-md uppercase tracking-wide backdrop-blur-2xs">
                      {caption.trim()}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-400 text-xs py-8">No image preview available</div>
            )}
          </div>

          {/* Image Context Hint (if description exists) */}
          {image.description && (
            <div className="rounded-md bg-blue-50/60 border border-blue-100 px-3 py-2 text-xs text-blue-900">
              <span className="font-semibold text-blue-950">Subject & features: </span>
              <span className="line-clamp-2 text-blue-800">{image.description}</span>
            </div>
          )}

          {/* Caption Options */}
          <form onSubmit={handleCreateMeme} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="captionInput" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Meme Caption
              </label>
              <button
                type="button"
                onClick={handleGenerateCaption}
                disabled={generatingCaption || savingMeme}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition cursor-pointer"
              >
                {generatingCaption ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Gemini is thinking...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>{caption ? 'Get another Gemini caption' : 'Generate with Gemini'}</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <textarea
                id="captionInput"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="Type your own witty caption or click 'Generate with Gemini'..."
                disabled={savingMeme}
                className="w-full rounded-md border border-gray-300 p-2.5 text-sm text-gray-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                You can write your own caption or have Gemini craft one based on the subject and features of the image.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClose}
                disabled={savingMeme}
                className="rounded-md border border-gray-300 px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!caption.trim() || savingMeme || generatingCaption}
                className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 transition cursor-pointer shadow-xs"
              >
                {savingMeme ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Saving meme...</span>
                  </>
                ) : (
                  <>
                    <span>🎭</span>
                    <span>Save Meme</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
