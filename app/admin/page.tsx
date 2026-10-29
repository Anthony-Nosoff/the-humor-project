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
  LLMProviders,
  LLMModels,
  PromptChains,
  PromptChainSteps,
  PromptChainMix,
  Terms,
  GenerationRequests,
  LLMResponses,
  AIGenerationExamples,
  AllowedSignupDomains,
  WhitelistedEmails,
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
  | 'llm_config'
  | 'prompt_chains'
  | 'ai_logs'
  | 'terms'
  | 'access_control';

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Core Data Collections
  const [profiles, setProfiles] = useState<Profiles[]>([]);
  const [images, setImages] = useState<AdminImage[]>([]);
  const [memes, setMemes] = useState<AdminMeme[]>([]);
  const [ratings, setRatings] = useState<MemeRatings[]>([]);

  // LLM Config Data
  const [providers, setProviders] = useState<LLMProviders[]>([]);
  const [models, setModels] = useState<LLMModels[]>([]);

  // Prompt Chains & Examples
  const [promptChains, setPromptChains] = useState<PromptChains[]>([]);
  const [chainSteps, setChainSteps] = useState<PromptChainSteps[]>([]);
  const [chainMix, setChainMix] = useState<PromptChainMix[]>([]);
  const [examples, setExamples] = useState<AIGenerationExamples[]>([]);

  // AI Logs
  const [genRequests, setGenRequests] = useState<GenerationRequests[]>([]);
  const [llmResponses, setLlmResponses] = useState<LLMResponses[]>([]);

  // Terms & Access Control
  const [terms, setTerms] = useState<Terms[]>([]);
  const [allowedDomains, setAllowedDomains] = useState<AllowedSignupDomains[]>([]);
  const [whitelistedEmails, setWhitelistedEmails] = useState<WhitelistedEmails[]>([]);

  // Modal & Form States
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [geminiLoadingId, setGeminiLoadingId] = useState<string | null>(null);

  // 1. Image Upload & Edit
  const [isUploadImageModalOpen, setIsUploadImageModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTriggerGemini, setUploadTriggerGemini] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingImageDescription, setEditingImageDescription] = useState<{ id: string; description: string } | null>(null);
  const [imageToDelete, setImageToDelete] = useState<AdminImage | null>(null);
  const [memeToDelete, setMemeToDelete] = useState<AdminMeme | null>(null);

  // 2. Terms Modal
  const [isTermModalOpen, setIsTermModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Terms | null>(null);
  const [termForm, setTermForm] = useState({ term: '', category: 'Humor Technique', definition: '' });

  // 3. Examples Modal
  const [isExampleModalOpen, setIsExampleModalOpen] = useState(false);
  const [editingExample, setEditingExample] = useState<AIGenerationExamples | null>(null);
  const [exampleForm, setExampleForm] = useState({ title: '', category: 'meme_caption', input_context: '', target_output: '' });

  // 4. Provider Modal
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProviders | null>(null);
  const [providerForm, setProviderForm] = useState({ name: '', slug: '', api_base_url: '', is_active: true });

  // 5. Model Modal
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<LLMModels | null>(null);
  const [modelForm, setModelForm] = useState({ display_name: '', model_id: '', provider_id: '', context_window: 128000, is_active: true });

  // 6. Domain Modal
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<AllowedSignupDomains | null>(null);
  const [domainForm, setDomainForm] = useState({ domain: '', is_active: true });

  // 7. Whitelisted Email Modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<WhitelistedEmails | null>(null);
  const [emailForm, setEmailForm] = useState({ email: '', notes: '' });

  // 8. Chain Mix Edit
  const [mixEdits, setMixEdits] = useState<Record<string, { weight: number; is_active: boolean; notes: string }>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadAllAdminData = useCallback(async () => {
    setRefreshing(true);
    try {
      // Parallel fetch of all tables
      const [
        pRes,
        imgRes,
        mRes,
        rRes,
        provRes,
        modRes,
        pcRes,
        pcsRes,
        pcmRes,
        termsRes,
        exRes,
        reqRes,
        respRes,
        domRes,
        wEmRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('images').select('*').order('created_at', { ascending: false }),
        supabase.from('memes').select('*').order('created_at', { ascending: false }),
        supabase.from('meme_ratings').select('*'),
        supabase.from('llm_providers').select('*').order('name'),
        supabase.from('llm_models').select('*').order('display_name'),
        supabase.from('prompt_chains').select('*').order('name'),
        supabase.from('prompt_chain_steps').select('*').order('step_order'),
        supabase.from('prompt_chain_mix').select('*'),
        supabase.from('terms').select('*').order('created_at', { ascending: false }),
        supabase.from('ai_generation_examples').select('*').order('created_at', { ascending: false }),
        supabase.from('generation_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('llm_responses').select('*').order('created_at', { ascending: false }),
        supabase.from('allowed_signup_domains').select('*').order('domain'),
        supabase.from('whitelisted_emails').select('*').order('email'),
      ]);

      const profList = pRes.data || [];
      setProfiles(profList);
      const profMap: Record<string, Profiles> = {};
      profList.forEach((p) => { profMap[p.id] = p; });

      setProviders(provRes.data || []);
      setModels(modRes.data || []);
      setPromptChains(pcRes.data || []);
      setChainSteps(pcsRes.data || []);
      const mixList = pcmRes.data || [];
      setChainMix(mixList);

      const initialMixMap: Record<string, { weight: number; is_active: boolean; notes: string }> = {};
      mixList.forEach((mix) => {
        initialMixMap[mix.id] = {
          weight: Number(mix.weight),
          is_active: mix.is_active ?? true,
          notes: mix.notes || '',
        };
      });
      setMixEdits(initialMixMap);

      setTerms(termsRes.data || []);
      setExamples(exRes.data || []);
      setGenRequests(reqRes.data || []);
      setLlmResponses(respRes.data || []);
      setAllowedDomains(domRes.data || []);
      setWhitelistedEmails(wEmRes.data || []);

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
      showToast('Error loading some admin datasets.');
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

  // ==========================================
  // IMAGE ACTIONS: CREATE, UPDATE, DELETE
  // ==========================================
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

  // ==========================================
  // TERMS CRUD
  // ==========================================
  const handleSaveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termForm.term.trim()) return;

    try {
      if (editingTerm) {
        const { data, error } = await supabase
          .from('terms')
          .update({
            term: termForm.term.trim(),
            category: termForm.category.trim() || 'general',
            definition: termForm.definition.trim() || null,
          })
          .eq('id', editingTerm.id)
          .select()
          .single();

        if (error) throw error;
        setTerms((prev) => prev.map((t) => (t.id === editingTerm.id ? data : t)));
        showToast('Term updated successfully.');
      } else {
        const { data, error } = await supabase
          .from('terms')
          .insert({
            term: termForm.term.trim(),
            category: termForm.category.trim() || 'general',
            definition: termForm.definition.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;
        setTerms((prev) => [data, ...prev]);
        showToast('Term created successfully.');
      }
      setIsTermModalOpen(false);
      setEditingTerm(null);
      setTermForm({ term: '', category: 'Humor Technique', definition: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save term';
      showToast(msg);
    }
  };

  const handleDeleteTerm = async (id: string) => {
    try {
      const { error } = await supabase.from('terms').delete().eq('id', id);
      if (error) throw error;
      setTerms((prev) => prev.filter((t) => t.id !== id));
      showToast('Term deleted.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete term';
      showToast(msg);
    }
  };

  // ==========================================
  // AI GENERATION EXAMPLES CRUD
  // ==========================================
  const handleSaveExample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exampleForm.title.trim() || !exampleForm.input_context.trim() || !exampleForm.target_output.trim()) {
      showToast('All fields are required.');
      return;
    }

    try {
      if (editingExample) {
        const { data, error } = await supabase
          .from('ai_generation_examples')
          .update({
            title: exampleForm.title.trim(),
            category: exampleForm.category.trim() || 'meme_caption',
            input_context: exampleForm.input_context.trim(),
            target_output: exampleForm.target_output.trim(),
          })
          .eq('id', editingExample.id)
          .select()
          .single();

        if (error) throw error;
        setExamples((prev) => prev.map((ex) => (ex.id === editingExample.id ? data : ex)));
        showToast('Example updated.');
      } else {
        const { data, error } = await supabase
          .from('ai_generation_examples')
          .insert({
            title: exampleForm.title.trim(),
            category: exampleForm.category.trim() || 'meme_caption',
            input_context: exampleForm.input_context.trim(),
            target_output: exampleForm.target_output.trim(),
          })
          .select()
          .single();

        if (error) throw error;
        setExamples((prev) => [data, ...prev]);
        showToast('Example added.');
      }
      setIsExampleModalOpen(false);
      setEditingExample(null);
      setExampleForm({ title: '', category: 'meme_caption', input_context: '', target_output: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save example';
      showToast(msg);
    }
  };

  const handleDeleteExample = async (id: string) => {
    try {
      const { error } = await supabase.from('ai_generation_examples').delete().eq('id', id);
      if (error) throw error;
      setExamples((prev) => prev.filter((ex) => ex.id !== id));
      showToast('Example deleted.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg);
    }
  };

  // ==========================================
  // LLM PROVIDERS CRUD
  // ==========================================
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name.trim() || !providerForm.slug.trim()) return;

    try {
      if (editingProvider) {
        const { data, error } = await supabase
          .from('llm_providers')
          .update({
            name: providerForm.name.trim(),
            slug: providerForm.slug.trim(),
            api_base_url: providerForm.api_base_url.trim() || null,
            is_active: providerForm.is_active,
          })
          .eq('id', editingProvider.id)
          .select()
          .single();

        if (error) throw error;
        setProviders((prev) => prev.map((p) => (p.id === editingProvider.id ? data : p)));
        showToast('Provider updated.');
      } else {
        const { data, error } = await supabase
          .from('llm_providers')
          .insert({
            name: providerForm.name.trim(),
            slug: providerForm.slug.trim(),
            api_base_url: providerForm.api_base_url.trim() || null,
            is_active: providerForm.is_active,
          })
          .select()
          .single();

        if (error) throw error;
        setProviders((prev) => [...prev, data]);
        showToast('Provider created.');
      }
      setIsProviderModalOpen(false);
      setEditingProvider(null);
      setProviderForm({ name: '', slug: '', api_base_url: '', is_active: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Provider save failed';
      showToast(msg);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      const { error } = await supabase.from('llm_providers').delete().eq('id', id);
      if (error) throw error;
      setProviders((prev) => prev.filter((p) => p.id !== id));
      setModels((prev) => prev.filter((m) => m.provider_id !== id));
      showToast('Provider deleted.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg);
    }
  };

  // ==========================================
  // LLM MODELS CRUD
  // ==========================================
  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelForm.display_name.trim() || !modelForm.model_id.trim()) return;

    try {
      if (editingModel) {
        const { data, error } = await supabase
          .from('llm_models')
          .update({
            display_name: modelForm.display_name.trim(),
            model_id: modelForm.model_id.trim(),
            provider_id: modelForm.provider_id || null,
            context_window: Number(modelForm.context_window) || 128000,
            is_active: modelForm.is_active,
          })
          .eq('id', editingModel.id)
          .select()
          .single();

        if (error) throw error;
        setModels((prev) => prev.map((m) => (m.id === editingModel.id ? data : m)));
        showToast('Model updated.');
      } else {
        const { data, error } = await supabase
          .from('llm_models')
          .insert({
            display_name: modelForm.display_name.trim(),
            model_id: modelForm.model_id.trim(),
            provider_id: modelForm.provider_id || null,
            context_window: Number(modelForm.context_window) || 128000,
            is_active: modelForm.is_active,
          })
          .select()
          .single();

        if (error) throw error;
        setModels((prev) => [...prev, data]);
        showToast('Model created.');
      }
      setIsModelModalOpen(false);
      setEditingModel(null);
      setModelForm({ display_name: '', model_id: '', provider_id: '', context_window: 128000, is_active: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Model save failed';
      showToast(msg);
    }
  };

  const handleDeleteModel = async (id: string) => {
    try {
      const { error } = await supabase.from('llm_models').delete().eq('id', id);
      if (error) throw error;
      setModels((prev) => prev.filter((m) => m.id !== id));
      showToast('Model deleted.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg);
    }
  };

  // ==========================================
  // ALLOWED SIGNUP DOMAINS CRUD
  // ==========================================
  const handleSaveDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainForm.domain.trim()) return;

    try {
      if (editingDomain) {
        const { data, error } = await supabase
          .from('allowed_signup_domains')
          .update({
            domain: domainForm.domain.trim().toLowerCase(),
            is_active: domainForm.is_active,
          })
          .eq('id', editingDomain.id)
          .select()
          .single();

        if (error) throw error;
        setAllowedDomains((prev) => prev.map((d) => (d.id === editingDomain.id ? data : d)));
        showToast('Domain updated.');
      } else {
        const { data, error } = await supabase
          .from('allowed_signup_domains')
          .insert({
            domain: domainForm.domain.trim().toLowerCase(),
            is_active: domainForm.is_active,
          })
          .select()
          .single();

        if (error) throw error;
        setAllowedDomains((prev) => [...prev, data]);
        showToast('Allowed domain added.');
      }
      setIsDomainModalOpen(false);
      setEditingDomain(null);
      setDomainForm({ domain: '', is_active: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Domain save failed';
      showToast(msg);
    }
  };

  const handleDeleteDomain = async (id: string) => {
    try {
      const { error } = await supabase.from('allowed_signup_domains').delete().eq('id', id);
      if (error) throw error;
      setAllowedDomains((prev) => prev.filter((d) => d.id !== id));
      showToast('Domain removed.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg);
    }
  };

  // ==========================================
  // WHITELISTED EMAILS CRUD
  // ==========================================
  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.email.trim()) return;

    try {
      if (editingEmail) {
        const { data, error } = await supabase
          .from('whitelisted_emails')
          .update({
            email: emailForm.email.trim().toLowerCase(),
            notes: emailForm.notes.trim() || null,
          })
          .eq('id', editingEmail.id)
          .select()
          .single();

        if (error) throw error;
        setWhitelistedEmails((prev) => prev.map((w) => (w.id === editingEmail.id ? data : w)));
        showToast('Whitelisted email updated.');
      } else {
        const { data, error } = await supabase
          .from('whitelisted_emails')
          .insert({
            email: emailForm.email.trim().toLowerCase(),
            notes: emailForm.notes.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;
        setWhitelistedEmails((prev) => [...prev, data]);
        showToast('Email whitelisted.');
      }
      setIsEmailModalOpen(false);
      setEditingEmail(null);
      setEmailForm({ email: '', notes: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save email';
      showToast(msg);
    }
  };

  const handleDeleteEmail = async (id: string) => {
    try {
      const { error } = await supabase.from('whitelisted_emails').delete().eq('id', id);
      if (error) throw error;
      setWhitelistedEmails((prev) => prev.filter((w) => w.id !== id));
      showToast('Email removed from whitelist.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      showToast(msg);
    }
  };

  // ==========================================
  // PROMPT CHAIN MIX: UPDATE WEIGHTS
  // ==========================================
  const handleSaveMix = async (mixId: string) => {
    const edit = mixEdits[mixId];
    if (!edit) return;

    setActionInProgress(mixId);
    try {
      const { data, error } = await supabase
        .from('prompt_chain_mix')
        .update({
          weight: edit.weight,
          is_active: edit.is_active,
          notes: edit.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mixId)
        .select()
        .single();

      if (error) throw error;
      setChainMix((prev) => prev.map((m) => (m.id === mixId ? data : m)));
      showToast('Prompt chain mix configuration updated.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mix update failed';
      showToast(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // ==========================================
  // USER ROLE MANAGEMENT
  // ==========================================
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

  // ==========================================
  // COMPUTED OVERVIEW STATISTICS & ANALYTICS
  // ==========================================
  const overviewStats = useMemo(() => {
    // Basic Counts
    const superAdminsCount = profiles.filter((p) => p.is_super_admin).length;
    const totalLikes = ratings.filter((r) => r.liked).length;
    const totalDislikes = ratings.filter((r) => !r.liked).length;
    const positiveRatingRatio =
      ratings.length > 0 ? Math.round((totalLikes / ratings.length) * 100) : 100;

    // Multimodal AI Summarization Coverage
    const summarizedImagesCount = images.filter(
      (img) => Boolean(img.description && img.description.trim())
    ).length;
    const unsummarizedImagesCount = images.length - summarizedImagesCount;
    const summarizationPercentage =
      images.length > 0
        ? Math.round((summarizedImagesCount / images.length) * 100)
        : 0;

    // Platform Funnel & Conversion Rates
    const imagesWithMemesCount = images.filter((img) => img.memesCount > 0).length;
    const imageToMemeConversion =
      images.length > 0
        ? Math.round((imagesWithMemesCount / images.length) * 100)
        : 0;
    const memesWithLikesCount = memes.filter((m) => m.likesCount > 0).length;
    const memeEngagementRate =
      memes.length > 0
        ? Math.round((memesWithLikesCount / memes.length) * 100)
        : 0;

    // 7-Day Velocity Data
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const label = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
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

    // Prompt Chain Mix Proportions
    const activeMix = chainMix.filter((m) => m.is_active !== false);
    const totalMixWeight = activeMix.reduce(
      (sum, m) => sum + (Number(m.weight) || 0),
      0
    );
    const mixWithChains = activeMix.map((mix, idx) => {
      const chain = promptChains.find((c) => c.id === mix.chain_id);
      const weightNum = Number(mix.weight) || 0;
      const percentage =
        totalMixWeight > 0
          ? Math.round((weightNum / totalMixWeight) * 100)
          : 0;
      return {
        ...mix,
        name: chain?.name || `Chain #${idx + 1}`,
        percentage,
      };
    });

    // Top 5 Memes Leaderboard
    const topMemes = [...memes]
      .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0))
      .slice(0, 5);
    const maxLikesInTop = Math.max(
      1,
      ...(topMemes.map((m) => m.likesCount || 0))
    );

    // Infrastructure & Policy Status
    const activeProviders = providers.filter((p) => p.is_active !== false).length;
    const activeModels = models.filter((m) => m.is_active !== false).length;
    const activeDomains = allowedDomains.filter((d) => d.is_active !== false).length;

    return {
      superAdminsCount,
      totalLikes,
      totalDislikes,
      positiveRatingRatio,
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
      mixWithChains,
      totalMixWeight,
      topMemes,
      maxLikesInTop,
      activeProviders,
      activeModels,
      activeDomains,
    };
  }, [
    profiles,
    images,
    memes,
    ratings,
    chainMix,
    promptChains,
    providers,
    models,
    allowedDomains,
  ]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-4 text-center">
        <div className="inline-block animate-spin text-3xl mb-3">⚙️</div>
        <p className="text-gray-600 font-medium text-sm">Verifying super admin privileges...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Super Admin Sign In Required</h2>
          <p className="text-sm text-gray-600 mb-6">
            You must be logged into a super admin account to view and access this control panel.
          </p>
          <Link href="/login" className="inline-block rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <div className="text-4xl mb-3">🚫</div>
          <h2 className="text-lg font-bold text-red-900 mb-2">Access Denied</h2>
          <p className="text-sm text-red-700 mb-4">
            Your account ({session.user.email}) does not currently have super admin privileges.
          </p>
          <p className="text-xs text-red-600 mb-6 bg-red-100 p-2.5 rounded font-mono">
            public.profiles.is_super_admin = false
          </p>
          <Link href="/" className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 text-white px-4 py-2.5 text-xs shadow-lg flex items-center gap-2 animate-fade-in">
          <span>🛡️</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🛡️</span>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">
              Super Admin Control Suite
            </h1>
            <span className="rounded-full bg-green-100 text-green-800 text-[10px] font-bold px-2.5 py-0.5 uppercase tracking-wide">
              Full Admin Privileges
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Complete platform management: Users, Prompt Chains, Terms, AI Media, Models, Domains, and Image CRUD.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAllAdminData}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <Link href="/memes" className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition">
            Community Memes &rarr;
          </Link>
        </div>
      </div>

      {/* Navigation Tabs - Mapped to All Criteria */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-2">
        {[
          { key: 'overview', label: '📊 Overview' },
          { key: 'users', label: `👥 Users (${profiles.length})` },
          { key: 'images', label: `🖼️ Images CRUD (${images.length})` },
          { key: 'media', label: `🎭 AI Generated Media (${memes.length})` },
          { key: 'prompt_chains', label: `⛓️ Prompt Chains & Mix (${promptChains.length})` },
          { key: 'llm_config', label: `🤖 LLM Models & Providers (${models.length})` },
          { key: 'terms', label: `📖 Terms (${terms.length})` },
          { key: 'ai_logs', label: `📜 AI Requests & Logs (${genRequests.length})` },
          { key: 'access_control', label: `🔐 Access Control & Domains (${allowedDomains.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === tab.key
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW & PLATFORM SUMMARY */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top KPI Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left transition hover:border-purple-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Profiles</span>
                <span className="text-gray-400 group-hover:text-purple-600 transition text-xs">👥</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{profiles.length}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                {overviewStats.superAdminsCount} Super {overviewStats.superAdminsCount === 1 ? 'Admin' : 'Admins'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('images')}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left transition hover:border-sky-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Images</span>
                <span className="text-gray-400 group-hover:text-sky-600 transition text-xs">🖼️</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{images.length}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                {overviewStats.summarizationPercentage}% AI Analyzed
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('media')}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left transition hover:border-purple-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">AI Memes</span>
                <span className="text-gray-400 group-hover:text-purple-600 transition text-xs">🎭</span>
              </div>
              <p className="text-2xl font-bold text-purple-600 mt-1">{memes.length}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                {overviewStats.imageToMemeConversion}% Img Conversion
              </span>
            </button>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Community Likes</span>
                <span className="text-rose-500 text-xs">❤️</span>
              </div>
              <p className="text-2xl font-bold text-rose-600 mt-1">{overviewStats.totalLikes}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                {overviewStats.positiveRatingRatio}% Positive Ratio
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('prompt_chains')}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left transition hover:border-indigo-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Chains & Mix</span>
                <span className="text-gray-400 group-hover:text-indigo-600 transition text-xs">⛓️</span>
              </div>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{promptChains.length}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                {overviewStats.mixWithChains.length} Active in Routing
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('terms')}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs text-left transition hover:border-amber-300 hover:shadow-xs group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Terms Glossary</span>
                <span className="text-gray-400 group-hover:text-amber-600 transition text-xs">📖</span>
              </div>
              <p className="text-2xl font-bold text-amber-600 mt-1">{terms.length}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                Active Definitions
              </span>
            </button>
          </div>

          {/* Row 1: Creation Velocity Bar Chart & Multimodal Vision Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 7-Day Velocity Chart */}
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>📈</span>
                    <span>Content Creation Velocity (Last 7 Days)</span>
                  </h3>
                  <p className="text-xs text-gray-500">Daily images uploaded vs AI memes generated across the platform</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-sky-500"></span>
                    <span className="text-gray-600">Images</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-purple-600"></span>
                    <span className="text-gray-600">Memes</span>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-700">
                    {overviewStats.total7DayActivity} total
                  </span>
                </div>
              </div>

              {/* Bars Container */}
              <div className="pt-2">
                <div className="h-44 flex items-end justify-between gap-2 border-b border-gray-200 pb-2 px-1 sm:px-4">
                  {overviewStats.activityByDay.map((day) => {
                    const imgHeight =
                      day.imagesCount > 0
                        ? Math.max(12, Math.round((day.imagesCount / overviewStats.maxDayCount) * 100))
                        : 0;
                    const memeHeight =
                      day.memesCount > 0
                        ? Math.max(12, Math.round((day.memesCount / overviewStats.maxDayCount) * 100))
                        : 0;

                    return (
                      <div key={day.dateStr} className="flex-1 flex flex-col items-center h-full justify-end group">
                        {/* Pair of bars */}
                        <div className="w-full flex items-end justify-center gap-1 sm:gap-2 h-36">
                          {/* Image bar */}
                          <div className="w-1/2 max-w-[22px] flex flex-col items-center justify-end h-full">
                            {day.imagesCount > 0 && (
                              <span className="text-[10px] font-bold text-sky-700 mb-1 opacity-80 group-hover:opacity-100">
                                {day.imagesCount}
                              </span>
                            )}
                            <div
                              style={{ height: `${imgHeight}%` }}
                              className={`w-full rounded-t-sm transition-all duration-300 ${
                                day.imagesCount > 0 ? 'bg-sky-500 hover:bg-sky-600' : 'bg-transparent'
                              }`}
                              title={`${day.label}: ${day.imagesCount} images`}
                            />
                          </div>

                          {/* Meme bar */}
                          <div className="w-1/2 max-w-[22px] flex flex-col items-center justify-end h-full">
                            {day.memesCount > 0 && (
                              <span className="text-[10px] font-bold text-purple-700 mb-1 opacity-80 group-hover:opacity-100">
                                {day.memesCount}
                              </span>
                            )}
                            <div
                              style={{ height: `${memeHeight}%` }}
                              className={`w-full rounded-t-sm transition-all duration-300 ${
                                day.memesCount > 0 ? 'bg-purple-600 hover:bg-purple-700' : 'bg-transparent'
                              }`}
                              title={`${day.label}: ${day.memesCount} memes`}
                            />
                          </div>
                        </div>

                        {/* Date label */}
                        <span className="text-[11px] font-medium text-gray-500 mt-2 text-center truncate w-full">
                          {day.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2">
                  <span>Baseline: 0 generations</span>
                  <span>Peak Activity: {overviewStats.maxDayCount} items/day</span>
                </div>
              </div>
            </div>

            {/* Multimodal Vision AI Donut Chart */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>👁️</span>
                  <span>Vision AI Analysis Coverage</span>
                </h3>
                <p className="text-xs text-gray-500">Multimodal descriptions generated via Gemini Flash</p>
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col items-center justify-center gap-6 py-2">
                {/* SVG Gauge */}
                <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    {/* Background Track */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      className="text-gray-100"
                      strokeWidth="10"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    {/* Emerald Progress Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      className="text-emerald-500 transition-all duration-700 ease-out"
                      strokeWidth="10"
                      strokeDasharray={238.76}
                      strokeDashoffset={238.76 - (238.76 * overviewStats.summarizationPercentage) / 100}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-black text-gray-900 leading-none">
                      {overviewStats.summarizationPercentage}%
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-1">
                      Coverage
                    </span>
                  </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="space-y-2.5 w-full text-xs">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span className="text-gray-700 font-medium">Vision Analyzed</span>
                    </div>
                    <span className="font-bold text-gray-900">{overviewStats.summarizedImagesCount} images</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                      <span className="text-gray-700 font-medium">Pending Analysis</span>
                    </div>
                    <span className="font-bold text-gray-900">{overviewStats.unsummarizedImagesCount} images</span>
                  </div>

                  <div className="flex items-center justify-between text-gray-500 pt-0.5">
                    <span>Total Image Library</span>
                    <span className="font-semibold text-gray-700">{images.length} images</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('images')}
                className="w-full rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 py-1.5 text-xs font-semibold text-center transition cursor-pointer"
              >
                Inspect Images & Trigger Summaries &rarr;
              </button>
            </div>
          </div>

          {/* Row 2: Conversion Funnel & Prompt Chain Routing Mix */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversion Funnel */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>🎯</span>
                    <span>Platform Conversion Funnel</span>
                  </h3>
                  <p className="text-xs text-gray-500">Progression from image upload to meme generation and likes</p>
                </div>
                <span className="rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 text-[10px] font-bold">
                  Pipeline Health
                </span>
              </div>

              <div className="space-y-4 pt-1">
                {/* Stage 1 */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-gray-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-[10px] font-bold">1</span>
                      <span>Source Images Uploaded</span>
                    </span>
                    <span className="font-bold text-gray-900">{images.length} images (100%)</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full w-full"></div>
                  </div>
                  <p className="text-[11px] text-gray-400">Baseline community & admin image library</p>
                </div>

                {/* Stage 2 */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-gray-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-bold">2</span>
                      <span>Converted to AI Memes</span>
                    </span>
                    <span className="font-bold text-purple-700">
                      {overviewStats.imagesWithMemesCount} images ({overviewStats.imageToMemeConversion}%) &bull; {memes.length} memes
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(8, overviewStats.imageToMemeConversion)}%` }}
                      className="h-full bg-purple-600 rounded-full transition-all duration-500"
                    ></div>
                  </div>
                  <p className="text-[11px] text-gray-400">Ratio of images that generated at least one AI meme</p>
                </div>

                {/* Stage 3 */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-gray-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-[10px] font-bold">3</span>
                      <span>Liked / Engaged by Community</span>
                    </span>
                    <span className="font-bold text-rose-600">
                      {overviewStats.memesWithLikesCount} memes ({overviewStats.memeEngagementRate}%) &bull; {overviewStats.totalLikes} likes
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(8, overviewStats.memeEngagementRate)}%` }}
                      className="h-full bg-rose-500 rounded-full transition-all duration-500"
                    ></div>
                  </div>
                  <p className="text-[11px] text-gray-400">Ratio of generated memes that earned positive ratings</p>
                </div>
              </div>
            </div>

            {/* Prompt Chain Routing Mix Breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>⚖️</span>
                    <span>Prompt Chain Routing Mix</span>
                  </h3>
                  <p className="text-xs text-gray-500">Weight proportion allocated across generative chains</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('prompt_chains')}
                  className="text-xs text-purple-600 hover:text-purple-800 font-semibold cursor-pointer"
                >
                  Tune Mix &rarr;
                </button>
              </div>

              {/* Segmented Distribution Bar */}
              <div className="space-y-3 pt-1">
                <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                  {overviewStats.mixWithChains.map((mix, idx) => {
                    const colors = ['bg-purple-600', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
                    const colorClass = colors[idx % colors.length];
                    return (
                      <div
                        key={mix.id}
                        style={{ width: `${mix.percentage}%` }}
                        className={`h-full ${colorClass} transition-all duration-500`}
                        title={`${mix.name}: ${mix.percentage}%`}
                      />
                    );
                  })}
                </div>

                {/* Legend Items */}
                <div className="space-y-2 pt-1 text-xs">
                  {overviewStats.mixWithChains.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No prompt chains configured in active mix.</p>
                  ) : (
                    overviewStats.mixWithChains.map((mix, idx) => {
                      const dotColors = ['bg-purple-600', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
                      const dotClass = dotColors[idx % dotColors.length];
                      return (
                        <div key={mix.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-3 h-3 rounded-full ${dotClass} flex-shrink-0`}></span>
                            <span className="font-semibold text-gray-900 truncate">{mix.name}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-gray-500 font-mono text-[11px]">Weight: {mix.weight}</span>
                            <span className="font-bold text-gray-900 bg-white border border-gray-200 px-2 py-0.5 rounded text-[11px]">
                              {mix.percentage}% of traffic
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <p className="text-[11px] text-gray-400 pt-1">
                  Traffic routing is stochastic based on the relative weights configured in the Prompt Chains & Mix tab.
                </p>
              </div>
            </div>
          </div>

          {/* Row 3: Top Memes Leaderboard & System Health */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Memes Leaderboard */}
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>🏆</span>
                    <span>Top Memes by Community Likes</span>
                  </h3>
                  <p className="text-xs text-gray-500">Highest rated AI captions and generated visual humor</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('media')}
                  className="text-xs text-purple-600 hover:text-purple-800 font-semibold cursor-pointer"
                >
                  View All Media &rarr;
                </button>
              </div>

              {overviewStats.topMemes.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">
                  No memes created yet. Upload images to generate captions.
                </div>
              ) : (
                <div className="space-y-3">
                  {overviewStats.topMemes.map((m, index) => {
                    const barWidth =
                      overviewStats.maxLikesInTop > 0
                        ? Math.max(12, Math.round(((m.likesCount || 0) / overviewStats.maxLikesInTop) * 100))
                        : 0;

                    const rankBadges = [
                      'bg-amber-100 text-amber-800 border-amber-300',
                      'bg-slate-100 text-slate-800 border-slate-300',
                      'bg-orange-100 text-orange-800 border-orange-300',
                      'bg-gray-100 text-gray-700 border-gray-200',
                      'bg-gray-100 text-gray-700 border-gray-200',
                    ];

                    return (
                      <div
                        key={m.id}
                        className="p-3 rounded-lg border border-gray-200 bg-gray-50/70 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold border text-[11px] flex-shrink-0 ${rankBadges[index]}`}>
                            #{index + 1}
                          </span>

                          {m.displayUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.displayUrl}
                              alt="Meme visual"
                              className="w-10 h-10 object-cover rounded border border-gray-200 flex-shrink-0 bg-gray-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded border border-gray-200 bg-gray-200 flex items-center justify-center text-xs flex-shrink-0">
                              🎭
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 italic line-clamp-1">
                              &ldquo;{m.caption || 'No caption'}&rdquo;
                            </p>
                            <span className="text-[10px] text-gray-400">
                              Created {new Date(m.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Relative Like Bar & Count */}
                        <div className="flex items-center gap-3 w-full sm:w-44 flex-shrink-0">
                          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${barWidth}%` }}
                              className="h-full bg-rose-500 rounded-full"
                            />
                          </div>
                          <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] flex-shrink-0">
                            <span>❤️</span>
                            <span>{m.likesCount || 0}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* System Infrastructure & Security Status */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>⚙️</span>
                    <span>System Infrastructure</span>
                  </h3>
                  <p className="text-xs text-gray-500">Live configuration & security guardrails</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Operational</span>
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                  <span className="text-gray-600">LLM Providers</span>
                  <span className="font-bold text-gray-900">
                    {overviewStats.activeProviders} active ({providers.length} total)
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                  <span className="text-gray-600">LLM Models Configured</span>
                  <span className="font-bold text-gray-900">
                    {overviewStats.activeModels} active ({models.length} total)
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                  <span className="text-gray-600">Signup Allowed Domains</span>
                  <span className="font-bold text-gray-900">{overviewStats.activeDomains} domains</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                  <span className="text-gray-600">Whitelisted VIP Emails</span>
                  <span className="font-bold text-gray-900">{whitelistedEmails.length} emails</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                  <span className="text-gray-600">AI In-Context Examples</span>
                  <span className="font-bold text-gray-900">{examples.length} examples</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-md bg-gray-50">
                  <span className="text-gray-600">Generation Logs Recorded</span>
                  <span className="font-bold text-gray-900">
                    {genRequests.length} reqs / {llmResponses.length} resps
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-1 text-xs text-blue-900">
                <p className="font-semibold text-blue-950 flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>Super Admin Privilege Active</span>
                </p>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  You have full CRUD access across all system entities. Use the tabs above to manage users, moderation, chains, and models.
                </p>
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
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-gray-700 font-bold">
                <tr>
                  <th className="px-4 py-3 text-left">User ID</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map((u) => {
                  const isCurrent = u.id === session.user.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-gray-500 text-[11px]">{u.id.slice(0, 8)}...</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : 'Anonymous'}
                        {isCurrent && <span className="ml-1.5 text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold">You</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.email || 'N/A'}</td>
                      <td className="px-4 py-3 text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {u.is_super_admin ? (
                          <span className="rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-bold">Super Admin</span>
                        ) : (
                          <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px]">Standard User</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleSuperAdmin(u)}
                          disabled={actionInProgress === u.id}
                          className={`rounded px-2.5 py-1 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                            u.is_super_admin
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                          }`}
                        >
                          {actionInProgress === u.id ? 'Saving...' : u.is_super_admin ? 'Demote Admin' : 'Make Super Admin'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: IMAGES CRUD (CREATE, READ, UPDATE, DELETE) */}
      {/* ========================================================= */}
      {activeTab === 'images' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Images Management (CRUD)</h3>
              <p className="text-xs text-gray-500">Create / upload new images, view all uploads, edit AI descriptions, and delete.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsUploadImageModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition cursor-pointer shadow-xs"
            >
              <span>+</span>
              <span>Upload New Image</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img) => (
              <div key={img.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs flex flex-col justify-between">
                <div className="relative aspect-video w-full bg-gray-900 flex items-center justify-center">
                  {img.displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.displayUrl} alt="" className="h-full w-full object-contain p-1" />
                  ) : (
                    <span className="text-xs text-gray-400">No preview</span>
                  )}
                  {img.memesCount === 0 && (
                    <span className="absolute top-2 right-2 rounded bg-amber-500 text-white px-2 py-0.5 text-[10px] font-bold">
                      0 Memes
                    </span>
                  )}
                </div>

                <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Uploader: {img.uploader?.email || img.uploader_id?.slice(0, 8) || 'Unknown'}</span>
                      <span>{new Date(img.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Inline Description Editor */}
                    {editingImageDescription?.id === img.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          rows={2}
                          value={editingImageDescription.description}
                          onChange={(e) => setEditingImageDescription({ id: img.id, description: e.target.value })}
                          className="w-full rounded border border-gray-300 p-1.5 text-xs text-gray-900 outline-none focus:border-blue-500"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingImageDescription(null)}
                            className="rounded px-2 py-1 text-[11px] text-gray-600 border border-gray-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateImageDescription(img.id, editingImageDescription.description)}
                            className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-start justify-between gap-2">
                        <p className="text-xs text-gray-800 line-clamp-2">
                          {img.description || <span className="italic text-gray-400">No summary description</span>}
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingImageDescription({ id: img.id, description: img.description || '' })}
                          className="text-[11px] text-blue-600 hover:underline flex-shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">
                      Memes: <strong>{img.memesCount}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleTriggerGeminiSummary(img)}
                        disabled={geminiLoadingId === img.id}
                        className="rounded px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer disabled:opacity-50"
                        title="Generate or re-run Gemini AI summary"
                      >
                        {geminiLoadingId === img.id ? 'Running...' : '✨ Gemini'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageToDelete(img)}
                        disabled={actionInProgress === img.id}
                        className="rounded px-2 py-1 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: READ/VIEW AI GENERATED MEDIA */}
      {/* ========================================================= */}
      {activeTab === 'media' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">AI Generated Media</h3>
            <p className="text-xs text-gray-500">Read and inspect community memes and AI-captioned visual media.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memes.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs flex flex-col justify-between">
                <div className="relative aspect-video w-full bg-gray-900 flex items-center justify-center">
                  {m.displayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.displayUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-gray-400">Image unavailable</span>
                  )}
                  <span className="absolute bottom-2 left-2 right-2 text-center text-white bg-black/80 text-xs font-black uppercase px-2 py-0.5 rounded shadow">
                    {m.caption}
                  </span>
                </div>

                <div className="p-3.5 space-y-2">
                  <p className="text-xs font-bold text-gray-900 line-clamp-2">&ldquo;{m.caption}&rdquo;</p>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                    <span>❤️ {m.likesCount} likes</span>
                    <span>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMemeToDelete(m)}
                    className="w-full rounded bg-red-50 border border-red-200 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer"
                  >
                    Delete AI Media
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: PROMPT CHAINS, STEPS, MIX, & EXAMPLES */}
      {/* ========================================================= */}
      {activeTab === 'prompt_chains' && (
        <div className="space-y-6">
          {/* Section A: Prompt Chains (Read) & Steps (Read) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>⛓️</span>
              <span>Prompt Chains & Steps</span>
            </h3>

            <div className="space-y-4">
              {promptChains.map((chain) => {
                const steps = chainSteps.filter((s) => s.chain_id === chain.id);
                return (
                  <div key={chain.id} className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs">{chain.name}</h4>
                        <p className="text-[11px] text-gray-500 mt-0.5">{chain.description}</p>
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono">Chain ID: {chain.id.slice(0, 8)}...</span>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Chain Steps ({steps.length})
                      </span>
                      {steps.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No steps registered for this chain.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {steps.map((st) => (
                            <div key={st.id} className="rounded border border-gray-200 bg-white p-2.5 text-xs flex items-start gap-3">
                              <span className="rounded bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 text-[10px]">
                                Step {st.step_order}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900">{st.step_name}</p>
                                <p className="text-[11px] text-gray-600 font-mono mt-0.5 bg-gray-50 p-1 rounded">
                                  {st.prompt_template}
                                </p>
                              </div>
                              <span className="text-[10px] text-gray-400 font-mono">{st.model_id || 'default'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section B: Prompt Chain Mix (Read / Update) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>⚖️</span>
              <span>Prompt Chain Mix (Read / Update)</span>
            </h3>
            <p className="text-xs text-gray-500">Adjust the generation routing weights and active status of each chain.</p>

            <div className="space-y-3">
              {chainMix.map((mix) => {
                const chain = promptChains.find((c) => c.id === mix.chain_id);
                const edit = mixEdits[mix.id] || { weight: Number(mix.weight), is_active: mix.is_active ?? true, notes: mix.notes || '' };

                return (
                  <div key={mix.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900">{chain?.name || 'Unnamed Chain'}</p>
                      <input
                        type="text"
                        value={edit.notes}
                        onChange={(e) => setMixEdits({ ...mixEdits, [mix.id]: { ...edit, notes: e.target.value } })}
                        placeholder="Configuration notes..."
                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 bg-white"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <label className="text-gray-500 font-medium">Weight:</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={edit.weight}
                          onChange={(e) => setMixEdits({ ...mixEdits, [mix.id]: { ...edit, weight: parseFloat(e.target.value) || 0 } })}
                          className="w-16 rounded border border-gray-300 px-2 py-1 text-xs bg-white text-center font-bold"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(e) => setMixEdits({ ...mixEdits, [mix.id]: { ...edit, is_active: e.target.checked } })}
                          className="rounded text-purple-600"
                        />
                        <span className="text-gray-700 font-medium">Active</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleSaveMix(mix.id)}
                        disabled={actionInProgress === mix.id}
                        className="rounded bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-700 transition"
                      >
                        {actionInProgress === mix.id ? 'Saving...' : 'Save Mix'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section C: AI Generation Examples (CRUD) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">AI Generation Examples (CRUD)</h3>
                <p className="text-xs text-gray-500">In-context learning few-shot examples for LLM caption generation.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingExample(null);
                  setExampleForm({ title: '', category: 'meme_caption', input_context: '', target_output: '' });
                  setIsExampleModalOpen(true);
                }}
                className="rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                + Add Example
              </button>
            </div>

            <div className="space-y-2">
              {examples.map((ex) => (
                <div key={ex.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">{ex.title}</span>
                      <span className="rounded bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.2 font-semibold">{ex.category}</span>
                    </div>
                    <p className="text-gray-600"><strong className="text-gray-700">Input:</strong> {ex.input_context}</p>
                    <p className="text-gray-900"><strong className="text-gray-700">Output:</strong> &ldquo;{ex.target_output}&rdquo;</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExample(ex);
                        setExampleForm({ title: ex.title, category: ex.category || 'meme_caption', input_context: ex.input_context, target_output: ex.target_output });
                        setIsExampleModalOpen(true);
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExample(ex.id)}
                      className="text-red-600 hover:underline ml-2"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: LLM MODELS & PROVIDERS (CRUD) */}
      {/* ========================================================= */}
      {activeTab === 'llm_config' && (
        <div className="space-y-6">
          {/* Providers (CRUD) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">LLM Providers (CRUD)</h3>
                <p className="text-xs text-gray-500">Configure provider endpoints like Google Gemini, OpenAI, and Anthropic.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingProvider(null);
                  setProviderForm({ name: '', slug: '', api_base_url: '', is_active: true });
                  setIsProviderModalOpen(true);
                }}
                className="rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                + Add Provider
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {providers.map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">{p.name}</span>
                    <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                      {p.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-mono truncate">{p.slug}</p>
                  <p className="text-[11px] text-gray-400 font-mono truncate">{p.api_base_url || 'Default endpoint'}</p>
                  <div className="pt-2 border-t border-gray-200 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProvider(p);
                        setProviderForm({ name: p.name, slug: p.slug, api_base_url: p.api_base_url || '', is_active: p.is_active ?? true });
                        setIsProviderModalOpen(true);
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProvider(p.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Models (CRUD) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">LLM Models (CRUD)</h3>
                <p className="text-xs text-gray-500">Register and configure models (context window, identifier, provider).</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingModel(null);
                  setModelForm({ display_name: '', model_id: '', provider_id: providers[0]?.id || '', context_window: 128000, is_active: true });
                  setIsModelModalOpen(true);
                }}
                className="rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                + Add Model
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {models.map((m) => {
                const prov = providers.find((p) => p.id === m.provider_id);
                return (
                  <div key={m.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">{m.display_name}</span>
                      <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${m.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-700 font-mono">{m.model_id}</p>
                    <p className="text-[11px] text-gray-500">Provider: {prov?.name || 'None'}</p>
                    <p className="text-[11px] text-gray-400">Context: {m.context_window?.toLocaleString()} tokens</p>
                    <div className="pt-2 border-t border-gray-200 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingModel(m);
                          setModelForm({ display_name: m.display_name, model_id: m.model_id, provider_id: m.provider_id || '', context_window: m.context_window || 128000, is_active: m.is_active ?? true });
                          setIsModelModalOpen(true);
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(m.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 7: TERMS (CRUD) */}
      {/* ========================================================= */}
      {activeTab === 'terms' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Terms & Vocabulary (CRUD)</h3>
              <p className="text-xs text-gray-500">Create, read, update, and delete glossary definitions, humor techniques, and prompt terms.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingTerm(null);
                setTermForm({ term: '', category: 'Humor Technique', definition: '' });
                setIsTermModalOpen(true);
              }}
              className="rounded bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition"
            >
              + Create Term
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {terms.map((t) => (
              <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-gray-900">{t.term}</span>
                    <span className="rounded bg-purple-50 text-purple-700 text-[10px] font-bold px-1.5 py-0.5">{t.category}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 line-clamp-3 leading-relaxed">
                    {t.definition || <span className="italic text-gray-400">No definition provided</span>}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTerm(t);
                      setTermForm({ term: t.term, category: t.category || 'general', definition: t.definition || '' });
                      setIsTermModalOpen(true);
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTerm(t.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 8: AI LOGS (GENERATION REQUESTS & LLM RESPONSES) */}
      {/* ========================================================= */}
      {activeTab === 'ai_logs' && (
        <div className="space-y-6">
          {/* Generation Requests */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-900">Generation Requests (Read)</h3>
            <div className="space-y-2">
              {genRequests.map((req) => (
                <div key={req.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">&ldquo;{req.prompt}&rdquo;</p>
                    <span className="text-[10px] text-gray-400 font-mono">ID: {req.id} | Model: {req.model_id || 'default'}</span>
                  </div>
                  <span className="rounded-full bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 uppercase">
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* LLM Responses */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-900">LLM Responses (Read)</h3>
            <div className="space-y-2">
              {llmResponses.map((res) => (
                <div key={res.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span className="font-mono">Model: {res.model_id}</span>
                    <span>{res.latency_ms} ms | {res.token_count} tokens</span>
                  </div>
                  <p className="font-medium text-gray-900 bg-white p-2 rounded border border-gray-200">
                    {res.response_text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 9: ACCESS CONTROL (ALLOWED DOMAINS & WHITELISTED EMAILS) */}
      {/* ========================================================= */}
      {activeTab === 'access_control' && (
        <div className="space-y-6">
          {/* Allowed Signup Domains (CRUD) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Allowed Signup Domains (CRUD)</h3>
                <p className="text-xs text-gray-500">Domains authorized for registration (e.g. columbia.edu, barnard.edu).</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingDomain(null);
                  setDomainForm({ domain: '', is_active: true });
                  setIsDomainModalOpen(true);
                }}
                className="rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                + Add Domain
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {allowedDomains.map((d) => (
                <div key={d.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-gray-900">@{d.domain}</span>
                    <span className={`ml-2 text-[10px] font-bold ${d.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                      {d.is_active ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDomain(d);
                        setDomainForm({ domain: d.domain, is_active: d.is_active ?? true });
                        setIsDomainModalOpen(true);
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDomain(d.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Whitelisted Emails (CRUD) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Whitelisted E-mail Addresses (CRUD)</h3>
                <p className="text-xs text-gray-500">Specific VIP or administrative accounts granted guaranteed access.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEmail(null);
                  setEmailForm({ email: '', notes: '' });
                  setIsEmailModalOpen(true);
                }}
                className="rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                + Whitelist Email
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {whitelistedEmails.map((w) => (
                <div key={w.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-gray-900">{w.email}</span>
                    {w.notes && <p className="text-[11px] text-gray-400 mt-0.5">{w.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmail(w);
                        setEmailForm({ email: w.email, notes: w.notes || '' });
                        setIsEmailModalOpen(true);
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEmail(w.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {/* 2. Terms Modal */}
      {isTermModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">{editingTerm ? 'Edit Term' : 'Create New Term'}</h3>
            <form onSubmit={handleSaveTerm} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Term Name</label>
                <input
                  type="text"
                  required
                  value={termForm.term}
                  onChange={(e) => setTermForm({ ...termForm, term: e.target.value })}
                  placeholder="e.g. Self-Deprecation"
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={termForm.category}
                  onChange={(e) => setTermForm({ ...termForm, category: e.target.value })}
                  placeholder="Humor Technique, Structure, Tone..."
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Definition</label>
                <textarea
                  rows={3}
                  value={termForm.definition}
                  onChange={(e) => setTermForm({ ...termForm, definition: e.target.value })}
                  placeholder="Humor definition or prompt directive..."
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTermModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-gray-600 border border-gray-300"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">
                  Save Term
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Examples Modal */}
      {isExampleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">{editingExample ? 'Edit AI Generation Example' : 'Add AI Example'}</h3>
            <form onSubmit={handleSaveExample} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={exampleForm.title}
                  onChange={(e) => setExampleForm({ ...exampleForm, title: e.target.value })}
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Input Context</label>
                <textarea
                  rows={2}
                  required
                  value={exampleForm.input_context}
                  onChange={(e) => setExampleForm({ ...exampleForm, input_context: e.target.value })}
                  placeholder="Image context or scenario..."
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Target Output Punchline</label>
                <textarea
                  rows={2}
                  required
                  value={exampleForm.target_output}
                  onChange={(e) => setExampleForm({ ...exampleForm, target_output: e.target.value })}
                  placeholder="Target humorous caption..."
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExampleModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-gray-600 border border-gray-300"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white">
                  Save Example
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Providers Modal */}
      {isProviderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">{editingProvider ? 'Edit Provider' : 'Add LLM Provider'}</h3>
            <form onSubmit={handleSaveProvider} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Provider Name</label>
                <input
                  type="text"
                  required
                  value={providerForm.name}
                  onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                  placeholder="e.g. Google Gemini"
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Slug Identifier</label>
                <input
                  type="text"
                  required
                  value={providerForm.slug}
                  onChange={(e) => setProviderForm({ ...providerForm, slug: e.target.value })}
                  placeholder="e.g. google-gemini"
                  className="w-full rounded border border-gray-300 p-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">API Base URL</label>
                <input
                  type="text"
                  value={providerForm.api_base_url}
                  onChange={(e) => setProviderForm({ ...providerForm, api_base_url: e.target.value })}
                  placeholder="https://api..."
                  className="w-full rounded border border-gray-300 p-2 text-xs font-mono"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={providerForm.is_active}
                  onChange={(e) => setProviderForm({ ...providerForm, is_active: e.target.checked })}
                  className="rounded text-purple-600"
                />
                <span>Active Provider</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProviderModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-gray-600 border border-gray-300"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white">
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Models Modal */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">{editingModel ? 'Edit LLM Model' : 'Add LLM Model'}</h3>
            <form onSubmit={handleSaveModel} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={modelForm.display_name}
                  onChange={(e) => setModelForm({ ...modelForm, display_name: e.target.value })}
                  placeholder="e.g. Gemini 2.5 Flash"
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Model ID</label>
                <input
                  type="text"
                  required
                  value={modelForm.model_id}
                  onChange={(e) => setModelForm({ ...modelForm, model_id: e.target.value })}
                  placeholder="e.g. gemini-2.5-flash"
                  className="w-full rounded border border-gray-300 p-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Provider</label>
                <select
                  value={modelForm.provider_id}
                  onChange={(e) => setModelForm({ ...modelForm, provider_id: e.target.value })}
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                >
                  <option value="">Select Provider...</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Context Window (Tokens)</label>
                <input
                  type="number"
                  value={modelForm.context_window}
                  onChange={(e) => setModelForm({ ...modelForm, context_window: parseInt(e.target.value, 10) || 128000 })}
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={modelForm.is_active}
                  onChange={(e) => setModelForm({ ...modelForm, is_active: e.target.checked })}
                  className="rounded text-purple-600"
                />
                <span>Active Model</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModelModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-gray-600 border border-gray-300"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white">
                  Save Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Domains Modal */}
      {isDomainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">{editingDomain ? 'Edit Allowed Domain' : 'Add Allowed Signup Domain'}</h3>
            <form onSubmit={handleSaveDomain} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Domain (without @)</label>
                <input
                  type="text"
                  required
                  value={domainForm.domain}
                  onChange={(e) => setDomainForm({ ...domainForm, domain: e.target.value })}
                  placeholder="e.g. columbia.edu"
                  className="w-full rounded border border-gray-300 p-2 text-xs font-mono"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={domainForm.is_active}
                  onChange={(e) => setDomainForm({ ...domainForm, is_active: e.target.checked })}
                  className="rounded text-purple-600"
                />
                <span>Active Domain</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDomainModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-gray-600 border border-gray-300"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white">
                  Save Domain
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Whitelisted Email Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">{editingEmail ? 'Edit Whitelisted Email' : 'Whitelist Email Address'}</h3>
            <form onSubmit={handleSaveEmail} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={emailForm.email}
                  onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes / Organization</label>
                <input
                  type="text"
                  value={emailForm.notes}
                  onChange={(e) => setEmailForm({ ...emailForm, notes: e.target.value })}
                  placeholder="e.g. Course TA, VIP Beta Tester..."
                  className="w-full rounded border border-gray-300 p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-gray-600 border border-gray-300"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white">
                  Save Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Delete Confirmation Modals */}
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
