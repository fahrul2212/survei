import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button, Logo } from "../components/ui";

export function Login() {
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    if (reset) {
      const { error: issue } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin,
      });
      issue ? setError(issue.message) : setMessage("Reset instructions have been sent if the account exists.");
    } else {
      const { error: issue } = await supabase.auth.signInWithPassword({ email, password });
      if (issue) setError(issue.message);
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-2">
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#d91f17] p-8 text-white md:p-12 lg:p-16">
        <Logo inverse />
        <div className="z-10 py-12">
          <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">Annual climate reporting.</h1>
          <p className="max-w-md text-lg leading-relaxed text-white/85">Submit your Climate Transition Plan securely — pre-filled from last year's verified data.</p>
        </div>
        
        <div className="pointer-events-none absolute bottom-[-180px] right-[-100px] size-[430px] rounded-full border border-white/20" aria-hidden="true" />
        
        <p className="z-10 max-w-sm text-xs font-semibold uppercase tracking-wider text-white/70">The Scandinavian Textile Initiative for Climate Action</p>
      </section>
      
      <section className="flex items-center justify-center bg-slate-50 p-6 md:p-12">
        <div className="w-full max-w-[420px]">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Secure reporting portal</p>
          <h2 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-900">{reset ? "Reset password" : "Welcome back"}</h2>
          <p className="mb-8 text-slate-500">
            {reset
              ? "We will send a secure reset link to your email."
              : "Use the account included in your STICA invitation."}
          </p>
          
          <form onSubmit={submit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              Work email
              <input
                type="email"
                value={email}
                placeholder="name@company.com"
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
              />
            </label>
            
            {!reset && (
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                Password
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    placeholder="Enter your password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white py-3 pl-4 pr-16 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-slate-400 hover:text-[#d91f17]"
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            )}
            
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-700">
                {error}
              </p>
            )}
            
            {message && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-700">
                {message}
              </p>
            )}
            
            <Button disabled={busy} className="mt-2 h-12 text-[15px]">
              {busy ? "Please wait…" : reset ? "Send reset link" : "Sign in to portal"}
            </Button>
          </form>
          
          <div className="mt-8 text-center">
            <button 
              className="text-sm font-semibold text-slate-500 hover:text-[#d91f17]" 
              onClick={() => setReset(!reset)}
            >
              {reset ? "Return to sign in" : "Forgot your password?"}
            </button>
            <p className="mt-8 text-xs font-medium text-slate-400">Company data is isolated with database row-level security.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
