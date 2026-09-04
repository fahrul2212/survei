export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type UserInvitation = {
  id: string;
  organization_id: number;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  role: "viewer" | "member" | "company_admin";
  status: InvitationStatus;
  expires_at: string;
  last_sent_at: string;
  sent_count: number;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
