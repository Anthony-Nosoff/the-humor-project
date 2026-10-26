import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memeId, liked = true } = body || {};

    if (!memeId) {
      return NextResponse.json({ error: 'memeId is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return NextResponse.json(
        { error: 'You must be signed in to rate memes.' },
        { status: 401 }
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

    // Check if user has an existing rating for this meme
    const { data: existingRating, error: checkError } = await supabase
      .from('meme_ratings')
      .select('*')
      .eq('user_id', user.id)
      .eq('meme_id', memeId)
      .maybeSingle();

    if (checkError) {
      console.warn('Error checking existing rating:', checkError);
    }

    let userLiked: boolean | null = null;

    if (existingRating) {
      if (existingRating.liked === liked) {
        // Toggle rating off if clicking the same rating again
        const { error: deleteError } = await supabase
          .from('meme_ratings')
          .delete()
          .eq('user_id', user.id)
          .eq('meme_id', memeId);

        if (deleteError) {
          throw deleteError;
        }
        userLiked = null;
      } else {
        // Update rating to opposite status
        const { error: updateError } = await supabase
          .from('meme_ratings')
          .update({ liked })
          .eq('user_id', user.id)
          .eq('meme_id', memeId);

        if (updateError) {
          throw updateError;
        }
        userLiked = liked;
      }
    } else {
      // Insert new rating
      const { error: insertError } = await supabase.from('meme_ratings').insert({
        user_id: user.id,
        meme_id: memeId,
        liked,
      });

      if (insertError) {
        throw insertError;
      }
      userLiked = liked;
    }

    // Get updated total likes count for this meme
    const { data: allRatings } = await supabase
      .from('meme_ratings')
      .select('liked')
      .eq('meme_id', memeId);

    const likesCount = allRatings ? allRatings.filter((r) => r.liked).length : 0;

    return NextResponse.json({
      success: true,
      memeId,
      likesCount,
      userLiked,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
