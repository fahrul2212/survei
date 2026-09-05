import { useState } from "react";
import { Dialog } from "../../common/Dialog";
import { Button } from "../../ui";
import { formatDate } from "../../../lib/portal";
import { publishChecks } from "./publish-checks";
import type { SurveyBuilderController } from "./useSurveyBuilder";

export function SurveyLifecycleDialog({ controller: c }: { controller: SurveyBuilderController }) {
  const [confirmed, setConfirmed] = useState(false);
  const action = c.pendingLifecycle;
  const version = c.selectedVersion;
  if (!action || !version) return null;
  const errors = action === "close" ? [] : publishChecks(version, c.questions);
  const label = { publish: "Publish survey", close: "Close survey", reopen: "Reopen survey" }[
    action
  ];
  return (
    <Dialog
      title={label}
      close={() => {
        if (!c.busy) c.setPendingLifecycle(null);
      }}
    >
      <h3 className="font-bold">
        {version.reporting_year} · {version.name}
      </h3>
      <dl className="my-5 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        {Object.entries({
          Questions: c.questions.length,
          Pages: c.sections.length,
          Required: c.questions.filter((q) => q.required).length,
          "Carry-forward enabled": c.questions.filter((q) => q.carryForwardEnabled).length,
          Opens: version.opens_at ? formatDate(version.opens_at) : "Immediately when published",
          Closes: version.closes_at ? formatDate(version.closes_at) : "No deadline set",
        }).map(([key, value]) => (
          <div key={key}>
            <dt className="text-slate-500">{key}</dt>
            <dd className="mt-1 font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {errors.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <strong>Resolve these issues first</strong>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-600">
          {action === "close"
            ? "Companies will be unable to edit this survey. Saved and submitted reports remain in the archive."
            : "Companies will be able to start or continue this survey. Published questions are locked; review their wording, answer choices and display rules in preview first."}
        </p>
      )}
      <label className="my-5 flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={c.busy}
          className="mt-1 size-4 accent-[#d91f17]"
        />
        {action === "close"
          ? "I have checked the deadline and current submissions."
          : "I have reviewed the survey preview and reporting dates."}
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" disabled={c.busy} onClick={() => c.setPendingLifecycle(null)}>
          Back
        </Button>
        <Button
          disabled={c.busy || !confirmed || errors.length > 0}
          onClick={() => void c.confirmLifecycle()}
        >
          {c.busy ? "Updating…" : label}
        </Button>
      </div>
    </Dialog>
  );
}
