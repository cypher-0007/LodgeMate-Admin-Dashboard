import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchAdminWebPush } from "@/lib/push/web-push";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceLabel: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminApi();
    const body = await request.json();

    if (body?.action === "test") {
      const result = await dispatchAdminWebPush({
        title: "LodgeMate Admin Push Verified",
        body: "Push notifications are active on this device.",
        url: "/settings",
        tag: `test-push-${Date.now()}`,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid push subscription payload." }, { status: 400 });
    }

    const adminDb = getSupabaseAdmin();
    const { error } = await adminDb.from("admin_push_subscriptions").upsert(
      {
        admin_user_id: admin.userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 250) ?? null,
        device_label: parsed.data.deviceLabel ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to save push subscription." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminApi();
    const body = await request.json();
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });
    }

    const adminDb = getSupabaseAdmin();
    await adminDb
      .from("admin_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to remove subscription." }, { status: 500 });
  }
}
