'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/app/supabase/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type {
  Profiles,
  Images,
  Memes,
  MemeRatings,
} from '@/app/supabase/types';

interface AdminMeme extends Memes {
  image?: Images | null;
  displayUrl: string;
  likesCount: number;
}

interface AdminImage extends Images {
  displayUrl: string;
  memesCount: number;
  uploader?: Profiles | null;
}

type TabKey =
  | 'overview'
  | 'users'
  | 'images'
  | 'media'
  | 'prompt_chains'
  | 'llm_config'
  | 'terms'
  | 'ai_logs'
  | 'access_control';

interface PlaceholderProps {
  icon: string;
  title: string;
  subtitle: string;
  removedTables: string[];
  plannedFeatures: string[];
}

function PlaceholderTab({ icon, title, subtitle, removedTables, plannedFeatures }: PlaceholderProps) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 md:p-12 text-center shadow-2xs space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-3xl mx-auto shadow-2xs">
        {icon}
      </div>

      <div className="space-y-2 max-w-xl mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span>Architecture Rework in Progress</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto text-left text-xs">
        <div className="rounded-lg bg-gray-50 p-4 border border-gray-200 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-gray-800">
            <span>🗑️</span>
            <span>Decommissioned Database Tables</span>
          </div>
          <p className="text-gray-500 text-[11px]">
            The following tables have been dropped from the database for the pipeline redesign:
          </p>
          <ul className="space-y-1.5 pt-1 font-mono text-[11px] text-red-600">
            {removedTables.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span>&bull;</span>
                <span className="bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-purple-50/50 p-4 border border-purple-200/60 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-purple-900">
            <span>🚀</span>
            <span>Planned Architecture Capabilities</span>
          </div>
          <p className="text-purple-700/70 text-[11px]">
            Key architectural features scheduled for implementation:
          </p>
          <ul className="space-y-1.5 pt-1 text-[11px] text-purple-900">
            {plannedFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-purple-500 font-bold">&check;</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Tab & Collapsible Sidebar State
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('admin_sidebar_collapsed');
      if (saved !== null) {
        setIsSidebarCollapsed(saved === 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('admin_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleSelectTab = (key: TabKey) => {
    setActiveTab(key);
    setIsMobileNavOpen(false);
  };

  // Core Active Collections
  const [profiles, setProfiles] = useState<Profiles[]>([]);
  const [images, setImages] = useState<AdminImage[]>([]);
  const [memes, setMemes] = useState<AdminMeme[]>([]);
  const [, setRatings] = useState<MemeRatings[]>([]);

  // Mutation and Loading States
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [geminiLoadingId, setGeminiLoadingId] = useState<string | null>(null);

  // Image Upload & Edit
  const [isUploadImageModalOpen, setIsUploadImageModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTriggerGemini, setUploadTriggerGemini] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingImageDescription, setEditingImageDescription] = useState<{ id: string; description: string } | null>(null);
  const [imageToDelete, setImageToDelete] = useState<AdminImage | null>(null);
  const [memeToDelete, setMemeToDelete] = useState<AdminMeme | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadAllAdminData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [pRes, imgRes, mRes, rRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('images').select('*').order('created_at', { ascending: false }),
        supabase.from('memes').select('*').order('created_at', { ascending: false }),
        supabase.from('meme_ratings').select('*'),
      ]);

      const profList = pRes.data || [];
      setProfiles(profList);
      const profMap: Record<string, Profiles> = {};
      profList.forEach((p) => { profMap[p.id] = p; });

      const rList = rRes.data || [];
      setRatings(rList);
      const likesByMeme: Record<string, number> = {};
      rList.forEach((r) => {
        if (r.liked) {
          likesByMeme[r.meme_id] = (likesByMeme[r.meme_id] || 0) + 1;
        }
      });

      const rawMemes = mRes.data || [];
      const memesCountByImage: Record<string, number> = {};
      rawMemes.forEach((m) => {
        if (m.image_id) {
          memesCountByImage[m.image_id] = (memesCountByImage[m.image_id] || 0) + 1;
        }
      });

      // Enrich images
      const rawImages = imgRes.data || [];
      const imagesMap: Record<string, AdminImage> = {};
      const enrichedImages: AdminImage[] = await Promise.all(
        rawImages.map(async (img) => {
          let displayUrl = '';
          if (img.url) {
            if (img.url.startsWith('http://') || img.url.startsWith('https://')) {
              displayUrl = img.url;
            } else {
              try {
                const { data: signed } = await supabase.storage.from('images').createSignedUrl(img.url, 3600);
                if (signed?.signedUrl) displayUrl = signed.signedUrl;
              } catch {
                // ignore
              }
              if (!displayUrl) {
                const { data: pub } = supabase.storage.from('images').getPublicUrl(img.url);
                displayUrl = pub.publicUrl;
              }
            }
          }
          const item: AdminImage = {
            ...img,
            displayUrl,
            memesCount: memesCountByImage[img.id] || 0,
            uploader: img.uploader_id ? profMap[img.uploader_id] : null,
          };
          imagesMap[img.id] = item;
          return item;
        })
      );
      setImages(enrichedImages);

      // Enrich memes
      const enrichedMemes: AdminMeme[] = rawMemes.map((meme) => {
        const img = meme.image_id ? imagesMap[meme.image_id] : null;
        return {
          ...meme,
          image: img,
          displayUrl: img?.displayUrl || '',
          likesCount: likesByMeme[meme.id] || 0,
        };
      });
      setMemes(enrichedMemes);
    } catch (err) {
      console.error('Error loading admin dataset:', err);
      showToast('Error loading admin datasets.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkAuthAndInit = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!currentSession?.user) {
        setSession(null);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }
      setSession(currentSession);

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', currentSession.user.id)
        .maybeSingle();

      if (!isMounted) return;
      const hasAdmin = Boolean(profile?.is_super_admin);
      setIsSuperAdmin(hasAdmin);
      setLoading(false);

      if (hasAdmin) {
        await loadAllAdminData();
      }
    };

    checkAuthAndInit();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      if (currentSession?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', currentSession.user.id)
          .maybeSingle();
        if (isMounted) {
          const hasAdmin = Boolean(profile?.is_super_admin);
          setIsSuperAdmin(hasAdmin);
          if (hasAdmin) loadAllAdminData();
        }
      } else {
        setIsSuperAdmin(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadAllAdminData]);

  // Image actions
  const handleUploadImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !session?.user) {
      showToast('Please choose an image file to upload.');
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = uploadFile.name.split('.').pop();
      const filePath = `admin/${Date.now()}.${fileExt}`;

      const { data: storageData, error: storageErr } = await supabase.storage
        .from('images')
        .upload(filePath, uploadFile);

      if (storageErr || !storageData) {
        throw new Error(storageErr?.message || 'Storage upload failed');
      }

      const { data: imageRow, error: dbErr } = await supabase
        .from('images')
        .insert({
          url: storageData.path,
          uploader_id: session.user.id,
          description: uploadDescription.trim() || null,
        })
        .select()
        .single();

      if (dbErr || !imageRow) {
        throw new Error(dbErr?.message || 'Failed to save image row');
      }

      if (uploadTriggerGemini && session.access_token) {
        showToast('Image uploaded! Generating Gemini summary...');
        fetch('/api/images/summarize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            imageId: imageRow.id,
            imagePath: storageData.path,
            mimeType: uploadFile.type || 'image/jpeg',
          }),
        })
          .then((r) => r.json())
          .then(() => loadAllAdminData())
          .catch(() => {});
      } else {
        showToast('Image uploaded successfully!');
        await loadAllAdminData();
      }

      setIsUploadImageModalOpen(false);
      setUploadFile(null);
      setUploadDescription('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleUpdateImageDescription = async (imageId: string, newDesc: string) => {
    setActionInProgress(imageId);
    try {
      const { error } = await supabase
        .from('images')
        .update({ description: newDesc.trim() || null })
        .eq('id', imageId);

      if (error) throw error;
      setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, description: newDesc.trim() || null } : img)));
      showToast('Image description updated.');
      setEditingImageDescription(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteImage = async () => {
    if (!imageToDelete || !session?.access_token) return;
    setActionInProgress(imageToDelete.id);
    try {
      const res = await fetch(`/api/images?id=${encodeURIComponent(imageToDelete.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete image');

      setImages((prev) => prev.filter((img) => img.id !== imageToDelete.id));
      setMemes((prev) => prev.filter((m) => m.image_id !== imageToDelete.id));
      showToast('Image and all corresponding memes deleted.');
      setImageToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleTriggerGeminiSummary = async (img: AdminImage) => {
    if (!session?.access_token || !img.url) return;
    setGeminiLoadingId(img.id);

    try {
      const res = await fetch('/api/images/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          imageId: img.id,
          imagePath: img.url,
          mimeType: 'image/jpeg',
        }),
      });

      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Server returned HTTP ${res.status}: ${resText}`);
      }

      if (!res.ok || !data.summary) {
        throw new Error(data.error || 'Failed to generate summary with Gemini');
      }

      setImages((prev) =>
        prev.map((i) => (i.id === img.id ? { ...i, description: data.summary } : i))
      );
      showToast('Gemini summary generated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error generating summary';
      showToast(msg);
    } finally {
      setGeminiLoadingId(null);
    }
  };

  const handleDeleteMeme = async () => {
    if (!memeToDelete || !session?.access_token) return;
    setActionInProgress(memeToDelete.id);
    try {
      const res = await fetch(`/api/memes?id=${encodeURIComponent(memeToDelete.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete meme');

      setMemes((prev) => prev.filter((m) => m.id !== memeToDelete.id));
      showToast('Meme deleted permanently.');
      setMemeToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleSuperAdmin = async (targetUser: Profiles) => {
    if (!session?.access_token) return;
    const nextStatus = !targetUser.is_super_admin;
    setActionInProgress(targetUser.id);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          isSuperAdmin: nextStatus,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update user role');

      setProfiles((prev) => prev.map((p) => (p.id === targetUser.id ? { ...p, is_super_admin: nextStatus } : p)));
      showToast(`User ${nextStatus ? 'promoted to' : 'demoted from'} Super Admin.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating user role';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  const overviewStats = useMemo(() => {
    const superAdminsCount = profiles.filter((p) => p.is_super_admin).length;
    const totalLikes = memes.reduce((sum, m) => sum + (m.likesCount || 0), 0);

    const summarizedImagesCount = images.filter(
      (img) => Boolean(img.description && img.description.trim().length > 0)
    ).length;
    const unsummarizedImagesCount = images.length - summarizedImagesCount;
    const summarizationPercentage =
      images.length > 0
        ? Math.round((summarizedImagesCount / images.length) * 100)
        : 0;

    const imagesWithMemesCount = images.filter((img) => img.memesCount > 0).length;
    const imageToMemeConversion =
      images.length > 0
        ? Math.round((imagesWithMemesCount / images.length) * 100)
        : 0;

    const memesWithLikesCount = memes.filter((m) => (m.likesCount || 0) > 0).length;
    const memeEngagementRate =
      memes.length > 0
        ? Math.round((memesWithLikesCount / memes.length) * 100)
        : 0;

    // Last 7 days activity
    const now = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
      return { dateStr, label };
    });

    const activityByDay = last7Days.map(({ dateStr, label }) => {
      const memesCount = memes.filter(
        (m) => m.created_at && m.created_at.startsWith(dateStr)
      ).length;
      const imagesCount = images.filter(
        (img) => img.created_at && img.created_at.startsWith(dateStr)
      ).length;
      return {
        dateStr,
        label,
        memesCount,
        imagesCount,
        total: memesCount + imagesCount,
      };
    });

    const maxDayCount = Math.max(
      1,
      ...activityByDay.map((d) => Math.max(d.memesCount, d.imagesCount))
    );
    const total7DayActivity = activityByDay.reduce((acc, d) => acc + d.total, 0);

    const topMemes = [...memes]
      .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0))
      .slice(0, 3);
    const maxLikesInTop = Math.max(
      1,
      ...(topMemes.map((m) => m.likesCount || 0))
    );

    return {
      superAdminsCount,
      totalLikes,
      summarizedImagesCount,
      unsummarizedImagesCount,
      summarizationPercentage,
      imagesWithMemesCount,
      imageToMemeConversion,
      memesWithLikesCount,
      memeEngagementRate,
      activityByDay,
      maxDayCount,
      total7DayActivity,
      topMemes,
      maxLikesInTop,
    };
  }, [profiles, images, memes]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-4 text-center">
        <div className="inline-block animate-spin text-3xl mb-3">🛡️</div>
        <p className="text-sm font-semibold text-gray-700">Verifying Super Admin Authorization...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-8 space-y-4">
          <div className="text-4xl">🔐</div>
          <h2 className="text-xl font-bold text-gray-900">Sign In Required</h2>
          <p className="text-xs text-gray-500">
            You must be authenticated with super administrator privileges to view this control panel.
          </p>
          <Link
            href="/login"
            className="inline-block w-full rounded-md bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <div className="bg-red-50 rounded-xl border border-red-200 p-8 space-y-4 text-left">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚫</span>
            <div>
              <h2 className="text-lg font-bold text-red-900">Super Admin Access Denied</h2>
              <p className="text-xs text-red-700">Privilege verification failed for: {session.user.email}</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Your user account does not possess active super administrator privileges in <code className="bg-red-100 text-red-800 px-1 py-0.5 rounded font-mono text-[11px]">public.profiles</code>.
          </p>
          <div className="pt-2 flex gap-3">
            <Link
              href="/"
              className="rounded-md bg-purple-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
            >
              &larr; Return to Explore
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const coreNavItems = [
    { key: 'overview' as TabKey, icon: '📊', label: 'Overview' },
    { key: 'users' as TabKey, icon: '👥', label: 'Users', count: profiles.length },
    { key: 'images' as TabKey, icon: '🖼️', label: 'Images CRUD', count: images.length },
    { key: 'media' as TabKey, icon: '🎭', label: 'AI Generated Media', count: memes.length },
  ];

  const pipelineNavItems = [
    { key: 'prompt_chains' as TabKey, icon: '⛓️', label: 'Prompt Chains & Mix', badge: 'Placeholder' },
    { key: 'llm_config' as TabKey, icon: '🤖', label: 'Models & Providers', badge: 'Placeholder' },
    { key: 'terms' as TabKey, icon: '📖', label: 'Terms & Vocabulary', badge: 'Placeholder' },
    { key: 'ai_logs' as TabKey, icon: '📜', label: 'Requests & Logs', badge: 'Placeholder' },
    { key: 'access_control' as TabKey, icon: '🔐', label: 'Access Control', badge: 'Placeholder' },
  ];

  return (
    <div className={`max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-col ${activeTab === 'overview' ? 'lg:h-[calc(100dvh-109px)] lg:overflow-hidden' : 'space-y-2.5'}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-xl flex items-center gap-2 animate-bounce">
          <span>🔔</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Admin Header */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <h1 className="text-lg font-bold text-gray-900">Super Admin Control Suite</h1>
            <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 border border-emerald-200">
              Verified Super Admin
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Platform management: Users, Images, and Community Memes. AI pipelines undergoing rework.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile Navigation Trigger Button */}
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition shadow-2xs cursor-pointer"
            title="Open navigation menu"
          >
            <span>☰</span>
            <span>Menu:</span>
            <span className="font-bold text-purple-900 capitalize">
              {activeTab.replace('_', ' ')}
            </span>
          </button>

          <button
            type="button"
            onClick={loadAllAdminData}
            disabled={refreshing}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>{refreshing ? 'Syncing...' : 'Sync Database'}</span>
          </button>
        </div>
      </div>

      {/* Admin Layout with Left Pinned Collapsible Navigation (Desktop) & Separate Drawer (Mobile) */}
      <div className={`flex flex-col lg:flex-row gap-3 relative ${activeTab === 'overview' ? 'flex-1 min-h-0 pt-2.5' : 'items-start'}`}>
        {/* Mobile Backdrop (separate overlay, does not push content) */}
        {isMobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar: Separate slide-over drawer on mobile (< lg), pinned sticky column on desktop (lg:) */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-full bg-white p-3.5 shadow-2xl overflow-y-auto transition-transform duration-300 ease-in-out
            lg:static lg:z-auto lg:translate-x-0 lg:p-0 lg:bg-transparent lg:shadow-none lg:overflow-visible lg:shrink-0 lg:sticky lg:top-3 lg:self-start lg:transition-[width] lg:duration-200
            ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}
            ${isSidebarCollapsed ? 'lg:w-16' : 'lg:w-64 xl:w-72'}
            ${activeTab === 'overview' ? 'lg:h-full lg:max-h-full lg:overflow-y-auto' : 'lg:h-auto'}
          `}
        >
          <div className="bg-white rounded-xl border border-gray-200 p-2.5 shadow-2xs space-y-3">
            {/* Mobile Drawer Header with Close Button */}
            <div className="flex lg:hidden items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-base">🛡️</span>
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Admin Navigation
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                title="Close navigation"
                className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Desktop Sidebar Header with Collapse / Expand Toggle */}
            <div className="hidden lg:flex items-center justify-between px-1.5 py-1">
              {!isSidebarCollapsed ? (
                <>
                  <span className="text-[11px] font-bold text-gray-700 tracking-wide uppercase">
                    Admin Menu
                  </span>
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    title="Collapse sidebar"
                    className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer text-xs"
                  >
                    ◀
                  </button>
                </>
              ) : (
                <div className="w-full flex justify-center">
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    title="Expand sidebar"
                    className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer text-xs"
                  >
                    ▶
                  </button>
                </div>
              )}
            </div>

            {/* Core Management Section */}
            <div>
              <div
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 ${
                  isSidebarCollapsed ? 'lg:hidden' : ''
                }`}
              >
                Core Management
              </div>
              {isSidebarCollapsed && (
                <div className="hidden lg:block border-t border-gray-100 my-1"></div>
              )}
              <nav className="space-y-1">
                {coreNavItems.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleSelectTab(tab.key)}
                      title={`${tab.label}${typeof tab.count === 'number' ? ` (${tab.count})` : ''}`}
                      className={`w-full rounded-lg text-xs font-semibold transition flex items-center cursor-pointer ${
                        isSidebarCollapsed
                          ? 'justify-between px-3 py-2 text-left lg:justify-center lg:p-2.5'
                          : 'justify-between px-3 py-2 text-left'
                      } ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base shrink-0">{tab.icon}</span>
                        <span className={`truncate ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                          {tab.label}
                        </span>
                      </div>
                      {typeof tab.count === 'number' && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                            isSidebarCollapsed ? 'lg:hidden' : ''
                          } ${
                            isActive
                              ? 'bg-purple-700 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* AI Pipelines Architecture Rework Section */}
            <div className="pt-2 border-t border-gray-100">
              <div
                className={`px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400 ${
                  isSidebarCollapsed ? 'lg:hidden' : ''
                }`}
              >
                <span>AI Pipelines V2</span>
                <span className="text-[9px] lowercase font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                  rework
                </span>
              </div>
              <nav className="space-y-1 mt-1">
                {pipelineNavItems.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleSelectTab(tab.key)}
                      title={`${tab.label} (${tab.badge})`}
                      className={`w-full rounded-lg text-xs font-medium transition flex items-center cursor-pointer ${
                        isSidebarCollapsed
                          ? 'justify-between px-3 py-2 text-left lg:justify-center lg:p-2.5'
                          : 'justify-between px-3 py-2 text-left'
                      } ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-xs font-semibold'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base shrink-0">{tab.icon}</span>
                        <span className={`truncate ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                          {tab.label}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-medium shrink-0 ${
                          isSidebarCollapsed ? 'lg:hidden' : ''
                        } ${
                          isActive
                            ? 'bg-purple-700 text-purple-100'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Quick Status / Sync Summary */}
            <div className="pt-2 border-t border-gray-100">
              <div
                className={`rounded-lg bg-gray-50/80 p-2.5 space-y-1.5 text-[11px] text-gray-500 ${
                  isSidebarCollapsed ? 'lg:hidden' : ''
                }`}
              >
                <div className="flex items-center justify-between text-gray-700 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Database Status</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                    Active
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>PostgreSQL Tables</span>
                  <span className="font-mono text-gray-700 font-semibold">5 active</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>AI Architecture</span>
                  <span className="font-semibold text-amber-700">Rework V2</span>
                </div>
              </div>

              {isSidebarCollapsed && (
                <div
                  className="hidden lg:flex items-center justify-center p-2 rounded-lg bg-gray-50/80"
                  title="Database: Active (5 tables) | AI Architecture: Rework V2"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Mobile Floating Action Button (Easy thumb access to menu anywhere on page) */}
        <button
          type="button"
          onClick={() => setIsMobileNavOpen(true)}
          className="lg:hidden fixed bottom-5 left-5 z-30 rounded-full bg-purple-600 text-white px-3.5 py-2.5 shadow-xl hover:bg-purple-700 transition flex items-center gap-2 text-xs font-bold active:scale-95 cursor-pointer border border-purple-400"
          title="Open Admin Navigation"
        >
          <span className="text-sm">☰</span>
          <span>Admin Menu</span>
        </button>

        {/* Right Content Area */}
        <div className={`flex-1 min-w-0 w-full flex flex-col ${activeTab === 'overview' ? 'h-full min-h-0' : 'space-y-4'}`}>

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="h-full flex flex-col gap-2.5 min-h-0">
          {/* Top KPI Metrics Strip - 4 Core Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xs text-left transition hover:border-purple-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 font-medium">Profiles</span>
                <span className="text-gray-400 group-hover:text-purple-600 transition text-xs">👥</span>
              </div>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{profiles.length}</p>
              <span className="inline-block mt-0.5 text-[9px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                {overviewStats.superAdminsCount} Super {overviewStats.superAdminsCount === 1 ? 'Admin' : 'Admins'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('images')}
              className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xs text-left transition hover:border-sky-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 font-medium">Images</span>
                <span className="text-gray-400 group-hover:text-sky-600 transition text-xs">🖼️</span>
              </div>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{images.length}</p>
              <span className="inline-block mt-0.5 text-[9px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded">
                {overviewStats.imagesWithMemesCount} converted to memes
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('media')}
              className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xs text-left transition hover:border-purple-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 font-medium">AI Memes</span>
                <span className="text-gray-400 group-hover:text-purple-600 transition text-xs">🎭</span>
              </div>
              <p className="text-lg font-bold text-purple-600 mt-0.5">{memes.length}</p>
              <span className="inline-block mt-0.5 text-[9px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                {overviewStats.imageToMemeConversion}% conversion rate
              </span>
            </button>

            <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xs text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 font-medium">Community Likes</span>
                <span className="text-rose-500 text-xs">❤️</span>
              </div>
              <p className="text-lg font-bold text-rose-600 mt-0.5">{overviewStats.totalLikes}</p>
              <span className="inline-block mt-0.5 text-[9px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded">
                {overviewStats.memesWithLikesCount} memes liked
              </span>
            </div>
          </div>

          {/* 4 Large Overview Panels - Fill All Available Vertical Space */}
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 lg:grid-flow-col gap-2 flex-1 min-h-0">
            {/* Panel 1: Content Creation Velocity */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs flex flex-col min-h-0 h-full">
              <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 shrink-0">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <span>📈</span>
                  <span>Content Creation Velocity (7 Days)</span>
                </h3>
                <div className="flex items-center gap-3 text-[11px] font-medium">
                  <span className="inline-flex items-center gap-1 text-sky-700">
                    <span className="w-2 h-2 rounded-xs bg-sky-500"></span>
                    <span>Images</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-purple-700">
                    <span className="w-2 h-2 rounded-xs bg-purple-600"></span>
                    <span>Memes</span>
                  </span>
                  <span className="text-gray-400 font-mono text-[10px]">({overviewStats.total7DayActivity} total)</span>
                </div>
              </div>

              {/* Bars */}
              <div className="flex-1 min-h-0 flex items-end justify-between gap-1.5 pt-2 px-1">
                {overviewStats.activityByDay.map((day) => {
                  const memeHeight = Math.round((day.memesCount / overviewStats.maxDayCount) * 100);
                  const imageHeight = Math.round((day.imagesCount / overviewStats.maxDayCount) * 100);

                  return (
                    <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-h-0">
                      <div className="w-full flex items-end justify-center gap-1 flex-1 min-h-0">
                        <div
                          style={{ height: `${imageHeight}%` }}
                          title={`Images on ${day.label}: ${day.imagesCount}`}
                          className="w-1/2 max-w-[14px] bg-sky-400 hover:bg-sky-500 transition-all rounded-t-xs min-h-[4px]"
                        />
                        <div
                          style={{ height: `${memeHeight}%` }}
                          title={`Memes on ${day.label}: ${day.memesCount}`}
                          className="w-1/2 max-w-[14px] bg-purple-600 hover:bg-purple-700 transition-all rounded-t-xs min-h-[4px]"
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium truncate shrink-0">{day.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Panel 2: Platform Conversion Funnel */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs flex flex-col justify-between min-h-0 h-full">
              <div className="border-b border-gray-100 pb-1.5 shrink-0">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>Platform Conversion Funnel</span>
                </h3>
              </div>

              <div className="flex-1 min-h-0 flex flex-col justify-around py-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-gray-700">1. Uploaded Images</span>
                    <span className="font-bold text-gray-900">{images.length} (100%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-purple-700">2. Converted to Memes</span>
                    <span className="font-bold text-purple-900">
                      {overviewStats.imagesWithMemesCount} ({overviewStats.imageToMemeConversion}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full"
                      style={{ width: `${overviewStats.imageToMemeConversion}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-rose-700">3. Liked by Community</span>
                    <span className="font-bold text-rose-900">
                      {overviewStats.memesWithLikesCount} ({overviewStats.memeEngagementRate}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{ width: `${overviewStats.memeEngagementRate}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 3: Top Memes Leaderboard */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs flex flex-col justify-between min-h-0 h-full">
              <div className="border-b border-gray-100 pb-1.5 flex items-center justify-between shrink-0">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <span>🏆</span>
                  <span>Top Community Memes</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('media')}
                  className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold cursor-pointer"
                >
                  View All &rarr;
                </button>
              </div>

              {overviewStats.topMemes.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                  No memes created yet.
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col justify-around py-0.5 space-y-1">
                  {overviewStats.topMemes.map((m, index) => {
                    const rankBadges = [
                      'bg-amber-100 text-amber-800 border-amber-300',
                      'bg-slate-100 text-slate-800 border-slate-300',
                      'bg-orange-100 text-orange-800 border-orange-300',
                    ];

                    return (
                      <div
                        key={m.id}
                        className="p-1.5 rounded-lg border border-gray-200 bg-gray-50/70 hover:bg-white transition flex items-center justify-between gap-2 text-xs flex-1 max-h-[46px]"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold border text-[9px] shrink-0 ${rankBadges[index]}`}>
                            #{index + 1}
                          </span>

                          {m.displayUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.displayUrl}
                              alt="Meme thumbnail"
                              className="w-7 h-7 object-cover rounded border border-gray-200 shrink-0 bg-gray-100"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded border border-gray-200 bg-gray-200 flex items-center justify-center text-[10px] shrink-0">
                              🎭
                            </div>
                          )}

                          <p className="font-medium text-gray-900 italic truncate text-[11px]">
                            &ldquo;{m.caption || 'No caption'}&rdquo;
                          </p>
                        </div>

                        <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                          <span>❤️</span>
                          <span>{m.likesCount || 0}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Panel 4: System Infrastructure Status */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-2xs flex flex-col justify-between min-h-0 h-full">
              <div className="border-b border-gray-100 pb-1.5 flex items-center justify-between shrink-0">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <span>⚙️</span>
                  <span>System Infrastructure</span>
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.2 text-[9px] font-bold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Operational</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs flex-1 py-1">
                <div className="p-1.5 rounded-lg bg-gray-50 border border-gray-100 flex justify-between items-center">
                  <span className="text-[11px] text-gray-600">Users</span>
                  <span className="font-bold text-gray-900 text-xs">{profiles.length}</span>
                </div>

                <div className="p-1.5 rounded-lg bg-gray-50 border border-gray-100 flex justify-between items-center">
                  <span className="text-[11px] text-gray-600">Images</span>
                  <span className="font-bold text-gray-900 text-xs">{images.length}</span>
                </div>

                <div className="p-1.5 rounded-lg bg-gray-50 border border-gray-100 flex justify-between items-center">
                  <span className="text-[11px] text-gray-600">Memes</span>
                  <span className="font-bold text-gray-900 text-xs">{memes.length}</span>
                </div>

                <div className="p-1.5 rounded-lg bg-amber-50/70 border border-amber-200/60 flex justify-between items-center">
                  <span className="text-[11px] text-amber-800 font-medium">AI Pipeline</span>
                  <span className="font-bold text-amber-900 text-[10px]">Rework V2</span>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-1.5 text-[10px] text-blue-900 flex items-center gap-2 shrink-0">
                <span>🛡️</span>
                <span className="text-blue-800">Super Admin privileges active across all profiles, storage, and memes.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: READ USERS (PROFILES) */}
      {/* ========================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Users Table (`public.profiles`)</h3>
              <p className="text-xs text-gray-500">Read and inspect user accounts, emails, and manage super admin permissions.</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">User ID</th>
                    <th className="py-3 px-4">Super Admin Status</th>
                    <th className="py-3 px-4">Created At</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {profiles.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">
                          {[u.first_name, u.last_name].filter(Boolean).join(' ') || 'Anonymous User'}
                        </div>
                        <div className="text-[11px] text-gray-400">{u.email || 'No email attached'}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-500 text-[11px]">
                        {u.id}
                      </td>
                      <td className="py-3 px-4">
                        {u.is_super_admin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[10px] font-bold text-purple-700">
                            <span>🛡️</span>
                            <span>Super Admin</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium text-gray-600">
                            Regular User
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleSuperAdmin(u)}
                          disabled={actionInProgress === u.id || (u.id === session.user.id && Boolean(u.is_super_admin))}
                          title={u.id === session.user.id && u.is_super_admin ? 'You cannot remove your own admin status' : ''}
                          className={`rounded px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 cursor-pointer ${
                            u.is_super_admin
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                              : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                          }`}
                        >
                          {actionInProgress === u.id ? 'Saving...' : u.is_super_admin ? 'Demote Admin' : 'Make Super Admin'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: CRUD IMAGES */}
      {/* ========================================================= */}
      {activeTab === 'images' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Images Repository (`public.images` & Storage)</h3>
              <p className="text-xs text-gray-500">
                Direct image upload, Gemini multimodal AI summarization trigger, inline description editing, and deletion.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsUploadImageModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition cursor-pointer shadow-xs flex-shrink-0"
            >
              <span>+</span>
              <span>Upload New Image</span>
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Preview</th>
                    <th className="py-3 px-4">Description / AI Summary</th>
                    <th className="py-3 px-4">Uploader</th>
                    <th className="py-3 px-4">Memes Count</th>
                    <th className="py-3 px-4">Uploaded At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {images.map((img) => (
                    <tr key={img.id} className="hover:bg-gray-50/80 transition">
                      <td className="py-3 px-4">
                        {img.displayUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img.displayUrl}
                            alt="Admin preview"
                            className="w-14 h-14 object-cover rounded-md border border-gray-200 bg-gray-100"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                            No visual
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        {editingImageDescription?.id === img.id ? (
                          <div className="space-y-2">
                            <textarea
                              rows={3}
                              value={editingImageDescription.description}
                              onChange={(e) =>
                                setEditingImageDescription({ id: img.id, description: e.target.value })
                              }
                              className="w-full rounded border border-gray-300 p-2 text-xs text-gray-900 outline-none focus:border-purple-500"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateImageDescription(img.id, editingImageDescription.description)}
                                disabled={actionInProgress === img.id}
                                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                              >
                                {actionInProgress === img.id ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingImageDescription(null)}
                                className="rounded bg-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-gray-900 leading-relaxed">
                              {img.description || (
                                <span className="italic text-gray-400">No description or AI summary yet.</span>
                              )}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingImageDescription({ id: img.id, description: img.description || '' })}
                                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 underline cursor-pointer"
                              >
                                Edit Description
                              </button>
                              <span>&bull;</span>
                              <button
                                type="button"
                                onClick={() => handleTriggerGeminiSummary(img)}
                                disabled={geminiLoadingId === img.id}
                                className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <span>✨</span>
                                <span>{geminiLoadingId === img.id ? 'Analyzing...' : 'Generate Gemini Summary'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {[img.uploader?.first_name, img.uploader?.last_name].filter(Boolean).join(' ') || img.uploader?.email || 'Anonymous'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {img.memesCount} {img.memesCount === 1 ? 'meme' : 'memes'}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {new Date(img.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setImageToDelete(img)}
                          className="rounded bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                        >
                          Delete Image
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: READ / VIEW / DELETE AI GENERATED MEDIA */}
      {/* ========================================================= */}
      {activeTab === 'media' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">AI Generated Media (`public.memes`)</h3>
              <p className="text-xs text-gray-500">Browse all AI generated captions, inspect community likes, and moderate media.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memes.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs flex flex-col justify-between">
                <div className="relative aspect-square bg-gray-100">
                  {m.displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.displayUrl} alt="Meme" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                      No Image Visual
                    </div>
                  )}
                  <span className="absolute top-2 right-2 rounded-full bg-black/70 backdrop-blur-xs text-white text-[11px] font-bold px-2 py-0.5 flex items-center gap-1">
                    <span>❤️</span>
                    <span>{m.likesCount}</span>
                  </span>
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-900 leading-snug">&ldquo;{m.caption}&rdquo;</p>
                    <span className="text-[10px] text-gray-400 block">
                      Created {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="font-mono text-[10px] text-gray-400">ID: {m.id.slice(0, 8)}...</span>
                    <button
                      type="button"
                      onClick={() => setMemeToDelete(m)}
                      className="rounded bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                    >
                      Delete Meme
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: PROMPT CHAINS & MIX (PLACEHOLDER) */}
      {/* ========================================================= */}
      {activeTab === 'prompt_chains' && (
        <PlaceholderTab
          icon="⛓️"
          title="Prompt Chains & Sequential Execution"
          subtitle="The prompt chain orchestration engine, multi-stage pipelines, and stochastic routing mix are currently being reworked."
          removedTables={[
            'public.prompt_chains',
            'public.prompt_chain_steps',
            'public.prompt_chain_mix',
            'public.ai_generation_examples',
          ]}
          plannedFeatures={[
            'Directed Acyclic Graph (DAG) prompt chain pipelines with parallel execution nodes',
            'Dynamic variable injection & context interpolation (descriptions, keywords, tone)',
            'Multi-turn conversational chains and step-level prompt temperature controls',
            'Stochastic and weighted routing mix with automatic failover fallback chains',
            'Few-shot learning example banks integrated directly into template stages',
          ]}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 6: LLM MODELS & PROVIDERS (PLACEHOLDER) */}
      {/* ========================================================= */}
      {activeTab === 'llm_config' && (
        <PlaceholderTab
          icon="🤖"
          title="LLM Models & AI Providers Registry"
          subtitle="The model registry and multi-provider AI infrastructure are undergoing an architectural redesign."
          removedTables={[
            'public.llm_providers',
            'public.llm_models',
          ]}
          plannedFeatures={[
            'Unified multi-provider adapter suite (Google Gemini, OpenAI, Anthropic, DeepSeek)',
            'Dynamic model context window tracking and real-time token pricing calculators',
            'Automated endpoint health checking, latency benchmarking, and rate-limit backoff',
            'Configurable system prompts and provider credentials vault',
          ]}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 7: TERMS & VOCABULARY (PLACEHOLDER) */}
      {/* ========================================================= */}
      {activeTab === 'terms' && (
        <PlaceholderTab
          icon="📖"
          title="Terms & Humor Vocabulary"
          subtitle="The humor techniques, punchline frameworks, and prompt glossary are being restructured for integration with the new AI pipeline."
          removedTables={[
            'public.terms',
          ]}
          plannedFeatures={[
            'Semantic categorization of humor techniques (irony, juxtaposition, hyperbole, anti-humor)',
            'Direct contextual injection of glossary definitions into prompt synthesis stages',
            'Searchable glossary with prompt example previews and tone tags',
            'Community-submitted humor frameworks with admin curation workflow',
          ]}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 8: AI REQUESTS & LOGS (PLACEHOLDER) */}
      {/* ========================================================= */}
      {activeTab === 'ai_logs' && (
        <PlaceholderTab
          icon="📜"
          title="AI Requests & Telemetry Logs"
          subtitle="AI generation audit logs and LLM response tracing are being upgraded into a real-time observability telemetry system."
          removedTables={[
            'public.generation_requests',
            'public.llm_responses',
          ]}
          plannedFeatures={[
            'End-to-end distributed tracing across pipeline execution steps',
            'Waterfall latency profiling and token consumption breakdown per step',
            'Generation request replay and prompt debugging inspector',
            'Error rate monitoring, hallucination flags, and moderation telemetry',
          ]}
        />
      )}

      {/* ========================================================= */}
      {/* TAB 9: ACCESS CONTROL & DOMAIN POLICIES (PLACEHOLDER) */}
      {/* ========================================================= */}
      {activeTab === 'access_control' && (
        <PlaceholderTab
          icon="🔐"
          title="Access Control & Domain Whitelisting"
          subtitle="Domain restrictions and signup policies are being refactored for the upcoming authentication and role governance upgrade."
          removedTables={[
            'public.allowed_signup_domains',
            'public.whitelisted_emails',
          ]}
          plannedFeatures={[
            'Fine-grained Role-Based Access Control (RBAC) with customizable permission tiers',
            'Institutional and corporate domain auto-enrollment with SSO support',
            'VIP whitelist invitations with time-limited signup tokens',
            'Audit logging of administrative role elevations and security events',
          ]}
        />
      )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}

      {/* 1. Upload Image Modal */}
      {isUploadImageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">Upload New Image as Super Admin</h3>
            <form onSubmit={handleUploadImage} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Select Image File</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  required
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Initial Description (Optional)</label>
                <textarea
                  rows={2}
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Subject, context, or visual features..."
                  className="w-full rounded border border-gray-300 p-2 text-xs text-gray-900 outline-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={uploadTriggerGemini}
                  onChange={(e) => setUploadTriggerGemini(e.target.checked)}
                  className="rounded text-purple-600"
                />
                <span>Automatically generate Gemini AI summary after upload</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUploadImageModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-gray-600 border border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingImage || !uploadFile}
                  className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadingImage ? 'Uploading...' : 'Upload Image'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Image Confirmation Modal */}
      {imageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
              <span>⚠️</span>
              <span>Confirm Delete Image</span>
            </h3>
            <p className="text-xs text-gray-600">
              Are you sure you want to delete this image? This will permanently remove the storage file, database record, and all associated memes.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImageToDelete(null)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteImage}
                disabled={Boolean(actionInProgress)}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {actionInProgress ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Meme Confirmation Modal */}
      {memeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
              <span>⚠️</span>
              <span>Confirm Delete AI Media</span>
            </h3>
            <p className="text-xs text-gray-600">
              Are you sure you want to delete meme: &ldquo;{memeToDelete.caption}&rdquo;?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMemeToDelete(null)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMeme}
                disabled={Boolean(actionInProgress)}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {actionInProgress ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
