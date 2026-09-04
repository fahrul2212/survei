import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button, Logo } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { manageInvitation } from "./api";
import type { UserInvitation } from "./types";

export function InvitationSetup({ invitation, onComplete }: { invitation: UserInvitation; onComplete: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const expired = new Date(invitation.expires_at).getTime() <= Date.now();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || expired) return;
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError("Use at least 12 characters with letters and a number.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    setError("");
    try {
      const update = await supabase.auth.updateUser({ password });
      if (update.error) throw update.error;
      await manageInvitation("complete", invitation.id);
      await supabase.auth.refreshSession();
      await onComplete();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to complete invitation");
    } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-5">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        <Logo />
        <span className="mt-8 grid size-11 place-items-center rounded-lg bg-red-50 text-[#d91f17]"><KeyRound size={21} /></span>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Secure invitation</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Create your password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Welcome, {invitation.full_name}. Set your own password before access to the company workspace is activated.</p>
        {expired ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">This invitation has expired. Ask your STICA or company administrator to resend it.</p>
        ) : (
          <form className="mt-7 grid gap-5" onSubmit={submit}>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">New password<input className="min-h-12 rounded-lg border border-slate-300 px-4 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Confirm password<input className="min-h-12 rounded-lg border border-slate-300 px-4 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" type="password" minLength={12} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 shrink-0" size={15} />Use a unique password of 12 or more characters with letters and a number. STICA never sends or stores a readable password.</p>
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Activating access…" : "Create password and continue"}</Button>
          </form>
        )}
      </section>
    </main>
  );
}
