'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import MarkdownRenderer from '@/app/components/markdownRenderer';
import MakeMemeModal from '@/app/components/MakeMemeModal';

interface UploadedImageState {
  id: string;
  url: string;
  displayUrl: string;
  description: string;
}

export default function UploadImage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState<string>('');
  const [summary, setSummary] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<UploadedImageState | null>(null);
  const [isMemeModalOpen, setIsMemeModalOpen] = useState(false);
  const [memeCreatedSuccess, setMemeCreatedSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!session) {
        router.push('/');
        return;
      }

      setSession(session);
      setLoading(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      if (!currentSession) {
        router.push('/');
      } else {
        setSession(currentSession);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleUpload = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.user) {
      setMessage({ text: 'You must be logged in to upload.', isError: true });
      return;
    }

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;

    if (!fileInput.files || fileInput.files.length === 0) {
      setMessage({ text: 'Please select a file to upload.', isError: true });
      return;
    }

    const file = fileInput.files[0];
    setUploading(true);
    setStatusText('Uploading image to storage...');
    setMessage(null);
    setSummary(null);
    setUploadedImage(null);
    setMemeCreatedSuccess(false);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

      // 1. Upload to Supabase Storage bucket 'images'
      const { data: storageData, error: storageError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (storageError) {
        console.error(`Error uploading file to ${filePath}:`, storageError);
        setMessage({ text: `Upload failed: ${storageError.message}`, isError: true });
        setUploading(false);
        setStatusText('');
        return;
      }

      console.log('File uploaded to storage bucket successfully:', storageData);

      // 2. Add a new row entry to public.images as defined in types.ts
      setStatusText('Recording image entry in database...');
      const { data: imageRow, error: dbError } = await supabase
        .from('images')
        .insert({
          url: storageData.path,
          uploader_id: session.user.id,
        })
        .select()
        .single();

      if (dbError || !imageRow) {
        console.error('Error inserting row into images table:', dbError);
        setMessage({
          text: `Uploaded to storage, but failed to insert into public.images: ${dbError?.message}`,
          isError: true,
        });
        setUploading(false);
        setStatusText('');
        return;
      }

      console.log('Inserted image row into public.images:', imageRow);

      // 3. Send image to Gemini server-side request to create summary and update public.images row
      setStatusText('Generating summary with Gemini...');

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
        throw new Error(
          `Server returned HTTP ${summarizeRes.status}: ${responseText || summarizeRes.statusText}`
        );
      }

      if (!summarizeRes.ok) {
        console.warn('Gemini summary error:', summarizeResult.error);
        setMessage({
          text: `Image saved, but Gemini summary failed: ${summarizeResult.error}`,
          isError: false,
        });
      } else {
        const generatedSummary = summarizeResult.summary;
        setSummary(generatedSummary);

        // Resolve display URL for the uploaded image
        let displayUrl = '';
        try {
          const { data: signedData } = await supabase.storage
            .from('images')
            .createSignedUrl(storageData.path, 3600);
          if (signedData?.signedUrl) {
            displayUrl = signedData.signedUrl;
          }
        } catch {
          // ignore error
        }

        if (!displayUrl) {
          const { data: publicData } = supabase.storage
            .from('images')
            .getPublicUrl(storageData.path);
          displayUrl = publicData.publicUrl;
        }

        setUploadedImage({
          id: imageRow.id,
          url: storageData.path,
          displayUrl,
          description: generatedSummary,
        });

        setMessage({
          text: 'Image uploaded and summarized successfully!',
          isError: false,
        });
        form.reset();
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Unexpected error during upload process:', errMessage);
      setMessage({ text: `Error: ${errMessage}`, isError: true });
    } finally {
      setUploading(false);
      setStatusText('');
    }
  };

  if (loading) {
    return <p className="text-gray-600">Loading...</p>;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-xs max-w-md">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Upload Images</h2>

      {message && (
        <div
          className={`mb-4 rounded p-3 text-sm ${
            message.isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}
        >
          <p>{message.text}</p>
          {!message.isError && (
            <div className="mt-2">
              <Link
                href="/my-images"
                className="font-semibold text-green-800 underline hover:text-green-950 text-xs"
              >
                View in My Images &rarr;
              </Link>
            </div>
          )}
        </div>
      )}

      {memeCreatedSuccess && (
        <div className="mb-4 rounded-md bg-purple-50 p-3.5 border border-purple-200 text-xs text-purple-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <span className="font-medium">Meme created successfully!</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/memes"
              className="font-semibold text-purple-700 hover:text-purple-900 underline"
            >
              View All Memes &rarr;
            </Link>
          </div>
        </div>
      )}

      {summary && (
        <div className="mb-4 rounded-md bg-blue-50 p-4 border border-blue-200 text-sm text-blue-900">
          <p className="font-semibold text-blue-950 mb-2">Generated Gemini Summary:</p>
          <MarkdownRenderer content={summary} className="text-blue-950 leading-relaxed" />

          {uploadedImage && (
            <div className="mt-4 pt-3 border-t border-blue-200 flex items-center justify-between gap-3">
              <span className="text-xs text-blue-900 font-medium">Turn this image into a meme:</span>
              <button
                type="button"
                onClick={() => setIsMemeModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition cursor-pointer"
              >
                <span>🎭</span>
                <span>Make meme</span>
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleUpload} className="space-y-4">
        <div>
          <input
            type="file"
            name="file"
            accept="image/*"
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer flex items-center gap-2"
        >
          {uploading ? (statusText || 'Processing...') : 'Upload'}
        </button>
      </form>

      {/* Make Meme Modal */}
      <MakeMemeModal
        isOpen={isMemeModalOpen}
        onClose={() => setIsMemeModalOpen(false)}
        image={uploadedImage}
        onMemeCreated={() => {
          setMemeCreatedSuccess(true);
        }}
      />
    </div>
  );
}
