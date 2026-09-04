import { supabase } from "../../lib/supabase";
import type { UserInvitation } from "./types";

const columns = "id,organization_id,auth_user_id,email,full_name,role,status,expires_at,last_sent_at,sent_count,accepted_at,revoked_at,created_at";

export async function listInvitations(organizationId: number): Promise<UserInvitation[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("user_invitations").select(columns)
    .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as UserInvitation[];
}

export async function pendingInvitation(userId: string): Promise<UserInvitation | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("user_invitations").select(columns)
    .eq("auth_user_id", userId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as UserInvitation | null;
}

export async function manageInvitation(action: "complete" | "resend" | "revoke", invitationId: string): Promise<void> {
  if (!supabase) throw new Error("Portal connection is unavailable");
  const { data, error } = await supabase.functions.invoke("manage-invitation", { body: { action, invitationId } });
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Invitation action failed");
}
