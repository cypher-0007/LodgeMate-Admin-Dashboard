import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordAdminAction } from "@/lib/audit/logger";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid administrator email."),
  password: z.string().min(1, "Password is required."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid credentials." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const allowedEmail = process.env.ADMIN_ALLOWED_EMAIL?.trim().toLowerCase();
    if (allowedEmail && email !== allowedEmail) {
      return NextResponse.json(
        { error: "Invalid administrator credentials or unauthorised account." },
        { status: 403 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Invalid administrator credentials or unauthorised account." },
        { status: 401 }
      );
    }

    const allowedUserId = process.env.ADMIN_ALLOWED_USER_ID?.trim();
    if (allowedUserId && data.user.id !== allowedUserId) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Invalid administrator credentials or unauthorised account." },
        { status: 403 }
      );
    }

    // Verify admin role in public.user_roles
    const adminDb = getSupabaseAdmin();
    const { data: roleRow } = await adminDb
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Invalid administrator credentials or unauthorised account." },
        { status: 403 }
      );
    }

    await recordAdminAction({
      actorId: data.user.id,
      action: "auth.login",
      targetType: "session",
      targetId: data.user.id,
      reason: "Shared administrator signed into lodgemateadmin.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Auth Login]", err);
    return NextResponse.json(
      { error: "Authentication service unavailable. Check server configuration." },
      { status: 500 }
    );
  }
}
