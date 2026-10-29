import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';

export async function PATCH(request: Request) {
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
        { error: 'You must be signed in to perform this action.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { targetUserId, isSuperAdmin } = body || {};

    if (!targetUserId || typeof isSuperAdmin !== 'boolean') {
      return NextResponse.json(
        { error: 'targetUserId and isSuperAdmin (boolean) are required.' },
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

    // Verify the caller is a super admin
    const { data: callerProfile, error: callerError } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (callerError || !callerProfile?.is_super_admin) {
      return NextResponse.json(
        { error: 'Forbidden: Super admin privileges required.' },
        { status: 403 }
      );
    }

    // Safety: prevent demoting oneself if you are the only super admin
    if (user.id === targetUserId && !isSuperAdmin) {
      const { data: adminList } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_super_admin', true);

      if (adminList && adminList.length <= 1) {
        return NextResponse.json(
          { error: 'Cannot revoke your own super admin status when you are the sole super admin.' },
          { status: 400 }
        );
      }
    }

    // Update target user's is_super_admin status
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ is_super_admin: isSuperAdmin })
      .eq('id', targetUserId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      message: `User ${isSuperAdmin ? 'promoted to' : 'demoted from'} super admin.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
