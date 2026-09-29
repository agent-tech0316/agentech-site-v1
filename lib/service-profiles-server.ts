import { supabaseRequest } from "@/lib/supabase-server";
import { readBuyerWorkspace, updateBuyerWorkspace } from "@/lib/data-collection-store";
import type { BuyerProfile, BuyerWorkspaceData, CollectionBrief, ServiceProfile } from "@/lib/data-collection";

export function serviceProfilesEnabled() { return process.env.NODE_ENV === "development" || process.env.AGENTECH_SERVICE_PROFILES_ENABLED === "1"; }
type ProfileRow = { id: string; profile_type: ServiceProfile["profileType"]; organization: string; contact_name: string; role: string; region: string };
type BriefRow = Omit<CollectionBrief, "createdAt"> & { created_at: string };
function toProfile(row: ProfileRow): ServiceProfile { return { profileType: row.profile_type, organization: row.organization, contactName: row.contact_name, role: row.role, region: row.region }; }

export async function loadServiceWorkspace(identity: string): Promise<BuyerWorkspaceData> {
  if (process.env.NODE_ENV === "development") return readBuyerWorkspace(identity);
  const accountFilter = `account_email=eq.${encodeURIComponent(identity)}`;
  const [profiles, briefs] = await Promise.all([
    supabaseRequest<ProfileRow[]>("agentech_service_profiles", { query: `${accountFilter}&select=id,profile_type,organization,contact_name,role,region` }),
    supabaseRequest<BriefRow[]>("agentech_collection_briefs", { query: `${accountFilter}&select=id,title,scenario,modality,format,quantity,unit,notes,status,created_at&order=created_at.desc&limit=100` })
  ]);
  const buyer = profiles.find((row) => row.profile_type === "data-buyer");
  const development = profiles.find((row) => row.profile_type === "development-client");
  return { profile: buyer ? toProfile(buyer) as BuyerProfile : null, developmentProfile: development ? toProfile(development) : null, briefs: briefs.map(({ created_at, ...brief }) => ({ ...brief, createdAt: created_at })) };
}
export async function saveServiceProfile(identity: string, profile: ServiceProfile) {
  if (process.env.NODE_ENV === "development") return updateBuyerWorkspace(identity, (current) => ({ ...current, ...(profile.profileType === "data-buyer" ? { profile: profile as BuyerProfile } : { developmentProfile: profile }) }));
  await supabaseRequest("agentech_service_profiles", { method: "POST", query: "on_conflict=account_email,profile_type", prefer: "resolution=merge-duplicates,return=minimal", body: { account_email: identity, profile_type: profile.profileType, organization: profile.organization, contact_name: profile.contactName, role: profile.role, region: profile.region, updated_at: new Date().toISOString() } });
  return loadServiceWorkspace(identity);
}
export async function saveCollectionBrief(identity: string, brief: CollectionBrief) {
  if (process.env.NODE_ENV === "development") return updateBuyerWorkspace(identity, (current) => ({ ...current, briefs: [brief, ...current.briefs] }));
  const profiles = await supabaseRequest<ProfileRow[]>("agentech_service_profiles", { query: `account_email=eq.${encodeURIComponent(identity)}&profile_type=eq.data-buyer&select=id&limit=1` });
  if (!profiles[0]) throw new Error("Buyer profile not found.");
  const { createdAt, ...values } = brief;
  await supabaseRequest("agentech_collection_briefs", { method: "POST", body: { ...values, account_email: identity, profile_id: profiles[0].id, profile_type: "data-buyer", created_at: createdAt } });
  return loadServiceWorkspace(identity);
}
