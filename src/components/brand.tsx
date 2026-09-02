export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`brand ${inverse ? "brand--inverse" : ""}`}>
      <img src="/stica-logo.png" alt="STICA" />
      <div>
        <strong>STICA</strong>
        <span>Climate Action</span>
      </div>
    </div>
  );
}
