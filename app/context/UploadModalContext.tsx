'use client';

import React, { createContext, useContext, useState, useCallback, Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import UploadImageModal from '@/app/components/UploadImageModal';

interface UploadModalContextType {
  isUploadModalOpen: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;
}

const UploadModalContext = createContext<UploadModalContextType>({
  isUploadModalOpen: false,
  openUploadModal: () => {},
  closeUploadModal: () => {},
});

export function useUploadModal() {
  const context = useContext(UploadModalContext);
  if (!context) {
    throw new Error('useUploadModal must be used within an UploadModalProvider');
  }
  return context;
}

function UploadUrlListener({ openModal }: { openModal: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get('upload') === 'true') {
      openModal();
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('upload');
        router.replace(url.pathname + (url.search || ''), { scroll: false });
      } catch {
        // fallback
      }
    }
  }, [searchParams, openModal, router]);

  return null;
}

export function UploadModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openUploadModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeUploadModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <UploadModalContext.Provider
      value={{
        isUploadModalOpen: isOpen,
        openUploadModal,
        closeUploadModal,
      }}
    >
      {children}
      <Suspense fallback={null}>
        <UploadUrlListener openModal={openUploadModal} />
      </Suspense>
      <UploadImageModal isOpen={isOpen} onClose={closeUploadModal} />
    </UploadModalContext.Provider>
  );
}
