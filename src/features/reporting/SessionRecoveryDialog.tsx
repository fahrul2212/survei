import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { Dialog } from "../../components/common/Dialog";
import { Button } from "../../components/ui";

export function SessionRecoveryDialog({
  email,
  userId,
  restored,
}: {
  email: string;
  userId: string;
  restored: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.user.id !== userId)
        throw new Error("Sign in with the same account to continue editing.");
      setPassword("");
      restored();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to restore your session.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Sign in again to continue" close={() => {}} dismissible={false}>
      <p className="text-sm leading-6 text-slate-600">
        Your session has expired. Unsaved report edits remain in this tab. Sign in with the same
        account, then retry saving. Keep this tab open until your changes are saved.
      </p>
      <form onSubmit={(event) => void signIn(event)} className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          Work email
          <input
            type="email"
            value={email}
            readOnly
            autoComplete="username"
            className="min-h-11 w-full rounded border border-slate-300 bg-slate-50 px-3"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="min-h-11 w-full rounded border border-slate-300 px-3"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
        <Button disabled={busy}>{busy ? "Signing in…" : "Sign in again"}</Button>
      </form>
    </Dialog>
  );
}
