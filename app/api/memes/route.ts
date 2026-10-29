import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database, Memes } from '@/app/supabase/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageId, caption } = body || {};

    if (!imageId) {
      return NextResponse.json(
        { error: 'imageId is required' },
        { status: 400 }
      );
    }

    if (!caption || typeof caption !== 'string' || !caption.trim()) {
      return NextResponse.json(
        { error: 'A non-empty caption is required to create a meme' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';

    const authHeader = request.headers.get('authorization');
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      },
    });

    // Create the new meme entry matching public.memes schema in types.ts
    const { data: newMeme, error: insertError } = await supabase
      .from('memes')
      .insert({
        image_id: imageId,
        caption: caption.trim(),
      })
      .select()
      .single();

    if (insertError || !newMeme) {
      console.error('Error inserting into public.memes:', insertError);
      return NextResponse.json(
        { error: insertError?.message || 'Failed to insert meme' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      meme: newMeme as Memes,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';

    const authHeader = request.headers.get('authorization');
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      },
    });

    let query = supabase.from('memes').select('*').order('created_at', { ascending: false });

    if (imageId) {
      query = query.eq('image_id', imageId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      memes: data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return NextResponse.json(
        { error: 'You must be signed in to delete a meme.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    let memeId = searchParams.get('id') || searchParams.get('memeId');

    if (!memeId) {
      try {
        const body = await request.json();
        memeId = body?.memeId || body?.id;
      } catch {
        // body parsing optional if id is in query params
      }
    }

    if (!memeId) {
      return NextResponse.json(
        { error: 'memeId is required to delete a meme.' },
        { status: 400 }
      );
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token.' },
        { status: 401 }
      );
    }

    // 1. Fetch meme and verify existence
    const { data: meme, error: memeError } = await supabase
      .from('memes')
      .select('id, image_id')
      .eq('id', memeId)
      .maybeSingle();

    if (memeError) {
      return NextResponse.json({ error: memeError.message }, { status: 500 });
    }

    if (!meme) {
      return NextResponse.json({ error: 'Meme not found.' }, { status: 404 });
    }

    // 2. Verify ownership: user must be the uploader of the meme's image, or a super admin
    if (!meme.image_id) {
      return NextResponse.json(
        { error: 'You are not authorized to delete this meme.' },
        { status: 403 }
      );
    }

    const { data: image, error: imgError } = await supabase
      .from('images')
      .select('uploader_id')
      .eq('id', meme.image_id)
      .maybeSingle();

    if (imgError || !image) {
      return NextResponse.json(
        { error: 'Associated image not found.' },
        { status: 404 }
      );
    }

    // Check if user is a super admin
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle();

    const isSuperAdmin = Boolean(callerProfile?.is_super_admin);

    if (image.uploader_id !== user.id && !isSuperAdmin) {
      return NextResponse.json(
        { error: 'You are only authorized to delete your own memes.' },
        { status: 403 }
      );
    }

    // 3. Delete any ratings associated with this meme to ensure referential integrity
    const { error: ratingsError } = await supabase
      .from('meme_ratings')
      .delete()
      .eq('meme_id', memeId);

    if (ratingsError) {
      console.warn('Warning: Could not delete meme ratings:', ratingsError);
    }

    // 4. Delete the meme
    const { error: deleteError } = await supabase
      .from('memes')
      .delete()
      .eq('id', memeId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      memeId,
      message: 'Meme deleted successfully.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
