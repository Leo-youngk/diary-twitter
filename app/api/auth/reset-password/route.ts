import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Created lazily so a missing env var fails the request, not the build.
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST /api/auth/reset-password
// Body: { email, newPassword }
// Uses admin API to reset password without email verification
export async function POST(request: Request) {
  try {
    const { email, newPassword } = await request.json();
    if (!email || !newPassword) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Find user by email
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const user = users.find(u => u.email === email);
    if (!user) {
      return NextResponse.json({ error: '该邮箱尚未注册' }, { status: 404 });
    }

    // Update password directly — no email needed
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
      email_confirm: true, // ensure confirmed
    });
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
