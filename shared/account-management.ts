export const internalRoles = {
  platform_admin: "Admin",
  platform_analyst: "Analyst",
} as const;
export type InternalRole = keyof typeof internalRoles;
export type ManagedAccount = {
  id: string;
  revision: string;
  email: string;
  name: string;
  role: string;
  disabled: boolean;
  confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  companies: Array<{ id: number; name: string; role: string }>;
};
export function accountInput(body: Record<string, unknown>, invite = false) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (
    !name ||
    name.length > 160 ||
    !(invite
      ? Object.hasOwn(internalRoles, role)
      : ["company", ...Object.keys(internalRoles)].includes(role)) ||
    (invite && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    (!invite && typeof body.disabled !== "boolean")
  )
    throw new Error("Provide a valid name, role and account details.");
  return { name, role, email, disabled: invite ? false : (body.disabled as boolean) };
}
