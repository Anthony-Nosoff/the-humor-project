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
