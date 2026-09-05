import { lazy, Suspense, useEffect, useState, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Loading, Logo, Button } from "./components/ui";

import { Login } from "./pages/Login";
import { InvitationSetup } from "./features/invitations/InvitationSetup";
import { pendingInvitation as loadPendingInvitation } from "./features/invitations/api";
import type { UserInvitation } from "./features/invitations/types";
import { SESSION_EXPIRED, hasPendingEdits } from "./lib/session-recovery";
import { SessionRecoveryDialog } from "./features/reporting/SessionRecoveryDialog";

const CompanyPortal = lazy(() =>
  import("./pages/CompanyPortal").then((module) => ({ default: module.CompanyPortal })),
);
const AdminPortal = lazy(() =>
  import("./pages/AdminPortal").then((module) => ({ default: module.AdminPortal })),
);
const AnalystPortal = lazy(() =>
  import("./pages/AnalystPortal").then((module) => ({ default: module.AnalystPortal })),
);

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [recovery, setRecovery] = useState(
    () => new URLSearchParams(window.location.search).get("internal_invite") === "1",
  );
  const [sessionExpired, setSessionExpired] = useState(false);
  const activeSession = useRef(session);
  activeSession.current = session;
  const [recoveryError, setRecoveryError] = useState("");
  const [invitation, setInvitation] = useState<UserInvitation | null | undefined>();
  const [inviteToken] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("invitation_token") ?? "";
    return /^[A-Za-z0-9_-]{20,500}$/.test(value) ? value : "";
  });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (!s && activeSession.current && hasPendingEdits()) setSessionExpired(true);
      else {
        setSession(s);
        if (!s || event === "SIGNED_IN") setSessionExpired(false);
      }
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const expired = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);

  useEffect(() => {
    if (
      !session ||
      ["platform_admin", "platform_analyst"].includes(session.user.app_metadata?.role)
    ) {
      setInvitation(null);
      return;
    }
    setInvitation(undefined);
    void loadPendingInvitation(session.user.id)
      .then(setInvitation)
      .catch(() => setInvitation(null));
  }, [session?.user.id, session?.user.app_metadata?.role]);

  if (!supabase) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-6">
        <section className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Logo />
          <h1 className="text-xl font-bold text-slate-900">Supabase configuration required</h1>
          <p className="text-sm text-slate-500">
            Add the project URL and publishable key. Never use a secret key in the frontend.
          </p>
        </section>
      </main>
    );
  }

  const client = supabase;

  if (session === undefined) return <Loading />;

  if (!session && inviteToken) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-5">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <Logo />
          <p className="mt-8 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">
            Company invitation
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Confirm your invitation
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Continue only if you expected an invitation to the STICA reporting portal. Your one-time
            credential is not used until you confirm.
          </p>
          {inviteError && (
            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {inviteError}
            </p>
          )}
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                window.history.replaceState({}, "", "/");
                window.location.reload();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={inviteBusy}
              onClick={async () => {
                setInviteBusy(true);
                setInviteError("");
                try {
                  const verified = await client.auth.verifyOtp({
                    token_hash: inviteToken,
                    type: "invite",
                  });
                  if (verified.error || !verified.data.session)
                    throw verified.error ?? new Error("Invitation could not be verified");
                  window.history.replaceState({}, "", "/");
                  setSession(verified.data.session);
                } catch (error) {
                  setInviteError(
                    error instanceof Error
                      ? error.message
                      : "This invitation is invalid or has expired.",
                  );
                } finally {
                  setInviteBusy(false);
                }
              }}
            >
              {inviteBusy ? "Confirming…" : "Accept invitation"}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (!session) return <Login />;

  if (session.user.app_metadata?.portal_disabled === true)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-5">
        <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-7">
          <Logo />
          <h1 className="mt-6 text-2xl font-bold">Portal access disabled</h1>
          <p className="my-5 text-sm leading-6 text-slate-600">
            Contact your administrator to restore access. Existing reports and audit records are
            retained.
          </p>
          <Button onClick={() => void client.auth.signOut()}>Sign out</Button>
        </section>
      </main>
    );

  if (invitation === undefined) return <Loading />;

  if (invitation) {
    return (
      <InvitationSetup
        invitation={invitation}
        onComplete={async () => {
          const refreshed = await client.auth.getSession();
          setSession(refreshed.data.session);
          setInvitation(null);
        }}
      />
    );
  }

  if (recovery) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-6">
        <section className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
          <form
            className="flex flex-col gap-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setRecoveryError("");
              const form = new FormData(e.currentTarget);
              const p = String(form.get("password"));
              const confirmation = String(form.get("confirmation"));
              if (p.length < 12 || !/[A-Za-z]/.test(p) || !/\d/.test(p))
                return setRecoveryError("Use at least 12 characters with letters and a number.");
              if (p !== confirmation) return setRecoveryError("Passwords do not match.");
              const r = await supabase!.auth.updateUser({ password: p });
              if (r.error) setRecoveryError(r.error.message);
              else {
                const url = new URL(window.location.href);
                url.searchParams.delete("internal_invite");
                window.history.replaceState({}, "", url);
                setRecovery(false);
              }
            }}
          >
            <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              New password
              <input
                name="password"
                type="password"
                minLength={12}
                autoComplete="new-password"
                required
                className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              Confirm password
              <input
                name="confirmation"
                type="password"
                minLength={12}
                autoComplete="new-password"
                required
                className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
              />
            </label>
            {recoveryError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {recoveryError}
              </p>
            )}
            <Button className="mt-2 h-12 text-[15px]">Save password</Button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      {sessionExpired && (
        <SessionRecoveryDialog
          email={session.user.email ?? ""}
          userId={session.user.id}
          restored={() => setSessionExpired(false)}
        />
      )}
      {session.user.app_metadata?.role === "platform_admin" ? (
        <AdminPortal key={session.user.id} session={session} />
      ) : session.user.app_metadata?.role === "platform_analyst" ? (
        <AnalystPortal key={session.user.id} session={session} />
      ) : (
        <CompanyPortal key={session.user.id} session={session} />
      )}
    </Suspense>
  );
}
