import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllUsers } from "@/lib/data/admin-queries";
import { PageHeader } from "@/components/ui/primitives";
import {
  ListingsClient,
  type EnrichedListingRow,
} from "@/components/features/listings-client";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const adminDb = getSupabaseAdmin();

  const [users, listingsRes, reportsRes] = await Promise.all([
    fetchAllUsers(),
    adminDb
      .from("listings")
      .select("*")
      .order("created_at", { ascending: false }),
    adminDb
      .from("reports")
      .select("listing_id, status")
      .not("listing_id", "is", null),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const reportCounts = new Map<string, number>();
  for (const r of reportsRes.data ?? []) {
    if (r.listing_id && r.status !== "dismissed") {
      reportCounts.set(r.listing_id, (reportCounts.get(r.listing_id) ?? 0) + 1);
    }
  }

  const enriched: EnrichedListingRow[] = await Promise.all((listingsRes.data ?? []).map(
    async (l: Record<string, unknown>) => {
      const ownerId = String(l.owner_id);
      const owner = userMap.get(ownerId);
      const id = String(l.id);
      return {
        id,
        ownerId,
        ownerName: owner?.full_name || owner?.email || "Unknown Host",
        ownerType: owner?.account_type || "landlord",
        title: String(l.title),
        kind: String(l.kind || "Full lodge"),
        school: String(l.school || "MOUAU"),
        area: String(l.area || ""),
        price: Number(l.price) || 0,
        period: String(l.period || "per year"),
        imageUrl: (l.image_url as string | null) ?? null,
        description: String(l.description || ""),
        verified: Boolean(l.verified),
        isBeta: Boolean(l.is_beta),
        status: String(l.status || "pending"),
        reportCount: reportCounts.get(id) ?? 0,
        createdAt: String(l.created_at),
        availableRooms: Number(l.available_rooms) || 1,
        ownershipProofPath: typeof l.ownership_proof_path === "string" ? l.ownership_proof_path : null,
      };
    }
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accommodation Listings"
        description="Inspect, verify, unpublish, or restore accommodation listings across MOUAU and ABSU without altering LodgeMate's publishing workflow."
      />
      <ListingsClient listings={enriched} />
    </div>
  );
}
