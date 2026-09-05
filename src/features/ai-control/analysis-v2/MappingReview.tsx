import { useEffect, useState } from "react";
import { Button } from "../../../components/ui";
import { changeMapping, getMappings, type Catalog } from "./api";
import { MappingProposalForm } from "./MappingProposalForm";
import type { SourceSelection } from "./MappingSources";

export function MappingReview() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function reload() {
    try {
      setCatalog(await getMappings());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load mappings");
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await changeMapping(body);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mapping operation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <summary className="cursor-pointer font-bold">Manage comparison mappings</summary>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Define what a measurement means and select its source questions. A different administrator
        must review and publish the proposal before it can be compared.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!catalog ? (
        <p className="mt-4 text-sm">
          {error ? "Mapping review is unavailable." : "Loading mappings…"}
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3">
            {catalog.proposals.map((p) => {
              const metric = p.payload.metric as Record<string, unknown>;
              const sources = p.payload.sources as SourceSelection[];
              return (
                <details key={p.id} className="min-w-0 rounded-lg border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    {String(metric.name)} · {p.status}
                  </summary>
                  <dl className="mt-3 grid gap-2 text-sm">
                    {[
                      "unit",
                      "population",
                      "scope",
                      "period",
                      "method",
                      "operations",
                      "options",
                    ].map((k) => (
                      <div key={k}>
                        <dt className="font-semibold capitalize">{k}</dt>
                        <dd className="break-words text-slate-600">{String(metric[k])}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-sm">
                    Dataset: {String(p.payload.dataset)} · {String(p.payload.reason)}
                  </p>
                  <ul className="my-3 grid gap-2 text-sm">
                    {sources.map((s) => {
                      const q = catalog.questions.find((q) => q.id === s.questionId);
                      return (
                        <li key={`${s.questionId}:${s.field}`} className="break-words">
                          {q?.year} · {q?.key} · {q?.prompt}
                          {s.field && ` · ${s.field}`}
                          <p className="mt-1 text-xs text-slate-500">
                            {q?.surveyName} ·{" "}
                            {s.transform.kind === "scale_decimal"
                              ? `Multiply by ${s.transform.factor}`
                              : s.transform.kind === "map_category"
                                ? Object.entries(s.transform.categories ?? {})
                                    .map(([a, b]) => `${a} → ${b}`)
                                    .join("; ")
                                : "Original unit and categories"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  {p.status === "draft" && (
                    <>
                      <Button
                        type="button"
                        disabled={busy || p.authorId === catalog.actorId}
                        onClick={() => void mutate({ operation: "publish", id: p.id })}
                      >
                        Approve and publish mapping
                      </Button>
                      {p.authorId === catalog.actorId && (
                        <p className="mt-2 text-xs text-slate-500">
                          Another administrator must approve your proposal.
                        </p>
                      )}
                    </>
                  )}
                </details>
              );
            })}
          </div>
          <MappingProposalForm catalog={catalog} busy={busy} save={(body) => void mutate(body)} />
          {catalog.releases
            .filter((r) => r.status === "published")
            .map((r) => (
              <Revoke
                key={r.id}
                release={r}
                busy={busy}
                revoke={(reason) => void mutate({ operation: "revoke", id: r.id, reason })}
              />
            ))}
        </>
      )}
    </details>
  );
}
function Revoke({
  release,
  busy,
  revoke,
}: {
  release: Catalog["releases"][number];
  busy: boolean;
  revoke: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <details className="mt-4 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-sm">Published mapping · {release.reason}</summary>
      <label className="mt-3 block text-sm">
        Reason for revoking approval
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </label>
      <p className="my-2 text-xs text-slate-500">
        Revocation makes affected saved analyses unavailable until they are rebuilt with an approved
        mapping.
      </p>
      <Button
        type="button"
        disabled={busy || reason.trim().length < 5}
        onClick={() => revoke(reason)}
      >
        Revoke approval
      </Button>
    </details>
  );
}
