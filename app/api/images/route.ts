import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';

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
        { error: 'You must be signed in to delete an image.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    let imageId = searchParams.get('id') || searchParams.get('imageId');

    if (!imageId) {
      try {
        const body = await request.json();
        imageId = body?.imageId || body?.id;
      } catch {
        // body parsing optional if id is in query params
      }
    }

    if (!imageId) {
      return NextResponse.json(
        { error: 'imageId is required to delete an image.' },
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

    // 1. Fetch image and verify existence
    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('*')
      .eq('id', imageId)
      .maybeSingle();

    if (imageError) {
      return NextResponse.json({ error: imageError.message }, { status: 500 });
    }

    if (!image) {
      return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
    }

    // 2. Verify ownership: user must be the uploader of the image
    if (image.uploader_id !== user.id) {
      return NextResponse.json(
        { error: 'You are only authorized to delete your own images.' },
        { status: 403 }
      );
    }

    // 3. Find any corresponding memes created from this image
    const { data: relatedMemes, error: relatedMemesError } = await supabase
      .from('memes')
      .select('id')
      .eq('image_id', imageId);

    if (relatedMemesError) {
      console.warn('Warning finding related memes:', relatedMemesError);
    }

    const memeIds = relatedMemes ? relatedMemes.map((m) => m.id) : [];

    // 4. Delete ratings for all related memes
    if (memeIds.length > 0) {
      const { error: ratingsError } = await supabase
        .from('meme_ratings')
        .delete()
        .in('meme_id', memeIds);

      if (ratingsError) {
        console.warn('Warning deleting ratings for image memes:', ratingsError);
      }

      // 5. Delete all related memes
      const { error: memesDeleteError } = await supabase
        .from('memes')
        .delete()
        .eq('image_id', imageId);

      if (memesDeleteError) {
        return NextResponse.json({ error: memesDeleteError.message }, { status: 500 });
      }
    }

    // 6. Delete file from Supabase storage if it exists
    if (image.url && !image.url.startsWith('http://') && !image.url.startsWith('https://')) {
      try {
        const { error: storageRemoveError } = await supabase.storage
          .from('images')
          .remove([image.url]);
        if (storageRemoveError) {
          console.warn('Warning removing image from storage:', storageRemoveError);
        }
      } catch (err) {
        console.warn('Failed to remove image from storage:', err);
      }
    }

    // 7. Delete the image row from public.images
    const { error: deleteError } = await supabase
      .from('images')
      .delete()
      .eq('id', imageId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      imageId,
      deletedMemesCount: memeIds.length,
      message: 'Image and all corresponding memes deleted successfully.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
