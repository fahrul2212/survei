import { useMemo, useState } from "react";
import { ArrowRight, Copy, Pencil, Plus, Trash2, FileText } from "lucide-react";
import { surveyDisplayTitle, type SurveyVersion } from "../../../lib/portal";
import { Button, EmptyState, PageHeader, StatusBadge } from "../../ui";
import type { SurveyBuilderController } from "./useSurveyBuilder";
import { SurveyDetailsDialog } from "./SurveyDetailsDialog";

export function SurveyCyclesView({ controller }: { controller: SurveyBuilderController }) {
  const { versions, busy, selected, beginCreateSurvey, openVersion } = controller;
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ version: SurveyVersion; remove: boolean } | null>(null);
  const visible = useMemo(
    () =>
      versions.filter(
        (v) =>
          (!status || v.status === status) &&
          `${v.name} ${v.reporting_year}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [versions, query, status],
  );
  return (
    <>
      <PageHeader
        eyebrow="Survey management"
        title="Surveys"
        description="Create, edit, duplicate and publish survey cycles. Close completed surveys to preserve company responses."
        actions={
          <Button icon={Plus} onClick={beginCreateSurvey} disabled={busy}>
            New survey
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <input
          aria-label="Search surveys"
          placeholder="Search survey name or year"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Survey status"
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-slate-50 p-5">
          <h2 className="font-bold">
            {visible.length} {visible.length === 1 ? "survey" : "surveys"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Edit details here, or open a survey to manage its questions and publishing.
          </p>
        </header>
        {!visible.length ? (
          <EmptyState
            icon={FileText}
            title="No matching surveys"
            description="Adjust your filters or create a new draft survey."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {visible.map((version) => (
              <article
                key={version.id}
                className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <span className="font-bold tabular-nums">{version.reporting_year}</span>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm" title={version.name}>
                      {surveyDisplayTitle(version.name)}
                    </strong>
                    <div className="mt-2">
                      <StatusBadge
                        status={version.status}
                        label={version.status === "draft" ? "Draft" : undefined}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    icon={Pencil}
                    disabled={busy}
                    onClick={() => setEditing({ version, remove: false })}
                    aria-label={`Edit details: ${version.name}`}
                  >
                    Details
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    icon={Copy}
                    disabled={busy}
                    onClick={() => controller.beginDuplicateSurvey(version)}
                    aria-label={`Duplicate ${version.name}`}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    icon={Trash2}
                    disabled={busy || version.status !== "draft"}
                    title={
                      version.status !== "draft"
                        ? "Only unused drafts can be deleted; close published surveys instead."
                        : "Delete unused draft"
                    }
                    onClick={() => setEditing({ version, remove: true })}
                    aria-label={`Delete draft: ${version.name}`}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    icon={ArrowRight}
                    disabled={busy}
                    onClick={() => void openVersion(version)}
                    aria-label={`Open ${version.name}`}
                  >
                    {busy && selected === version.id ? "Opening…" : "Open"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {editing && (
        <SurveyDetailsDialog
          version={editing.version}
          remove={editing.remove}
          close={() => setEditing(null)}
          saved={async (deleted) => {
            const preferred = deleted
              ? versions.find((v) => v.id !== editing.version.id)?.id
              : editing.version.id;
            await controller.load(true, preferred);
            setEditing(null);
            controller.setNotice({
              kind: "success",
              message: deleted ? "Unused draft deleted." : "Survey details updated.",
            });
          }}
        />
      )}
    </>
  );
}
