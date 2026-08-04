import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client — only runs server-side, never exposed to browser
// Created lazily so a missing env var fails the request, not the build.
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * POST /api/auth/confirm
 * When a user's email is unconfirmed (from a previous failed signup),
 * use the admin client to confirm it so they can log in immediately.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();

    // Find the user by email
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const user = users.find(u => u.email === email);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Confirm their email
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
