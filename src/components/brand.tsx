export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`flex select-none items-center gap-3 ${inverse ? "text-white" : "text-slate-900"}`}>
      <img className="size-10 rounded-lg object-contain" src="/stica-logo.png" alt="STICA" />
      <div className="grid gap-0.5">
        <strong className="font-display text-xl font-extrabold tracking-[0.14em] leading-none">STICA</strong>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">Climate Action</span>
      </div>
    </div>
  );
}
