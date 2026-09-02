import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Button, type Notice } from "../components/ui";

export function AccountSettings({ session }: { session: Session }) {
  const [name, setName] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setName(data.full_name);
        setNameLoaded(true);
      });
  }, [session.user.id]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setNameBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("user_id", session.user.id);
    setNameBusy(false);
    setNameNotice(error ? { kind: "error", message: error.message } : { kind: "success", message: "Name updated." });
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password !== confirm) return setPwNotice({ kind: "error", message: "Passwords do not match." });
    if (password.length < 8) return setPwNotice({ kind: "error", message: "Password must be at least 8 characters." });
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (error) return setPwNotice({ kind: "error", message: error.message });
    setPwNotice({ kind: "success", message: "Password updated successfully." });
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
      <div className="mb-10 flex flex-col items-start gap-3">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Your profile</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Account settings</h1>
          <p className="mt-2 text-slate-500">{session.user.email}</p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <form className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8" onSubmit={saveName}>
          <h3 className="text-xl font-bold text-slate-900">Display name</h3>
          {nameNotice && (
            <p className={`rounded-lg px-3.5 py-2.5 text-[13px] font-semibold ${nameNotice.kind === "error" ? "border border-red-200 bg-red-50 text-red-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {nameNotice.message}
            </p>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Full name
            <input
              className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10 disabled:cursor-not-allowed disabled:opacity-60"
              value={name}
              placeholder={nameLoaded ? "Your full name" : "Loading…"}
              disabled={!nameLoaded || nameBusy}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <Button disabled={!nameLoaded || nameBusy}>
            {nameBusy ? "Saving…" : "Save display name"}
          </Button>
        </form>

        <form className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8" onSubmit={changePassword}>
          <h3 className="text-xl font-bold text-slate-900">Change password</h3>
          {pwNotice && (
            <p className={`rounded-lg px-3.5 py-2.5 text-[13px] font-semibold ${pwNotice.kind === "error" ? "border border-red-200 bg-red-50 text-red-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {pwNotice.message}
            </p>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            New password
            <input 
              className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
              type="password" value={password} minLength={8} placeholder="Min. 8 characters" onChange={(e) => setPassword(e.target.value)} required 
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Confirm password
            <input 
              className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
              type="password" value={confirm} placeholder="Repeat new password" onChange={(e) => setConfirm(e.target.value)} required 
            />
          </label>
          <Button disabled={pwBusy}>
            {pwBusy ? "Saving…" : "Change password"}
          </Button>
        </form>
      </section>
    </div>
  );
}
