import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const QuerySchema = z.object({
  bucket: z.enum(["verification-documents", "report-evidence", "beta-media"]),
  path: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    const body = await request.json();
    const parsed = QuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid document request." }, { status: 400 });
    }

    // Prevent path traversal
    if (parsed.data.path.includes("..")) {
      return NextResponse.json({ error: "Invalid document path." }, { status: 400 });
    }

    const adminDb = getSupabaseAdmin();
    const { data, error } = await adminDb.storage
      .from(parsed.data.bucket)
      .createSignedUrl(parsed.data.path, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || "Document could not be loaded." },
        { status: 404 }
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl, expiresInSeconds: 60 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to sign document URL." }, { status: 500 });
  }
}
