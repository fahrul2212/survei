import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Loading, Logo, Button } from "./components/ui";

import { Login } from "./pages/Login";
import { CompanyPortal } from "./pages/CompanyPortal";
import { AdminPortal } from "./pages/AdminPortal";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-6">
        <section className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Logo />
          <h1 className="text-xl font-bold text-slate-900">Supabase configuration required</h1>
          <p className="text-sm text-slate-500">Add the project URL and publishable key. Never use a secret key in the frontend.</p>
        </section>
      </main>
    );
  }

  if (session === undefined) return <Loading />;

  if (!session) return <Login />;

  if (recovery) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-6">
        <section className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
          <form
            className="flex flex-col gap-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const p = String(new FormData(e.currentTarget).get("password"));
              const r = await supabase!.auth.updateUser({ password: p });
              if (!r.error) setRecovery(false);
            }}
          >
            <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              New password
              <input 
                name="password" 
                type="password" 
                minLength={8} 
                required 
                className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
              />
            </label>
            <Button className="mt-2 h-12 text-[15px]">Save password</Button>
          </form>
        </section>
      </main>
    );
  }

  return session.user.app_metadata?.role === "platform_admin"
    ? <AdminPortal session={session} />
    : <CompanyPortal session={session} />;
}
