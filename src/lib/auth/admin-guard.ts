import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SHARED_ADMIN_ACTOR_LABEL } from "@/lib/constants";

export interface VerifiedAdminSession {
  userId: string;
  email: string;
  actorLabel: string;
}

/**
 * Verifies that the current request has:
 * 1. A valid server-verified Supabase Auth user (`auth.getUser()` — never trusts cookies/getSession alone)
 * 2. The `admin` role in `public.user_roles`
 * 3. Match against optional `ADMIN_ALLOWED_EMAIL` / `ADMIN_ALLOWED_USER_ID` defense-in-depth allowlist
 */
export async function getVerifiedAdminSession(): Promise<VerifiedAdminSession | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user || !user.email) {
      return null;
    }

    const allowedEmail = process.env.ADMIN_ALLOWED_EMAIL?.trim().toLowerCase();
    if (allowedEmail && user.email.toLowerCase() !== allowedEmail) {
      return null;
    }

    const allowedUserId = process.env.ADMIN_ALLOWED_USER_ID?.trim();
    if (allowedUserId && user.id !== allowedUserId) {
      return null;
    }

    const adminDb = getSupabaseAdmin();
    const { data: roleRow, error: roleErr } = await adminDb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr || !roleRow) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      actorLabel: SHARED_ADMIN_ACTOR_LABEL,
    };
  } catch {
    return null;
  }
}

/**
 * Use in Server Components and Server Actions to enforce admin-only access.
 * Redirects unauthorised callers to `/login`.
 */
export async function requireAdminPage(): Promise<VerifiedAdminSession> {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Use in API Route Handlers & Server Actions to reject unauthorised calls with an explicit error.
 */
export async function requireAdminApi(): Promise<VerifiedAdminSession> {
  const session = await getVerifiedAdminSession();
  if (!session) {
    throw new Error("UNAUTHORIZED_ADMIN");
  }
  return session;
}
