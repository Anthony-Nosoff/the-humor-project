'use client';

import { useUploadModal } from '@/app/context/UploadModalContext';

export default function FloatingUploadButton() {
  const { openUploadModal } = useUploadModal();

  return (
    <button
      type="button"
      onClick={openUploadModal}
      title="Upload New Image"
      aria-label="Upload New Image"
      className="fixed bottom-6 right-6 z-40 flex md:hidden h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-all duration-200 hover:bg-purple-700 hover:scale-105 hover:shadow-xl active:scale-95 focus:outline-none focus:ring-4 focus:ring-purple-300 cursor-pointer"
    >
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  );
}
