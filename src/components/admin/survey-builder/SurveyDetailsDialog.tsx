import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import type { SurveyVersion } from "../../../lib/portal";
import { Dialog } from "../../common/Dialog";
import { Button } from "../../ui";

type Inspection = {
  survey: SurveyVersion & { updated_at: string };
  reports: number;
  canDelete: boolean;
};
const field =
  "mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal";
function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function SurveyDetailsDialog({
  version,
  remove,
  close,
  saved,
}: {
  version: SurveyVersion;
  remove: boolean;
  close: () => void;
  saved: (deleted: boolean) => Promise<void>;
}) {
  const [inspection, setInspection] = useState<Inspection | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [name, setName] = useState(version.name),
    [year, setYear] = useState(version.reporting_year);
  const [opens, setOpens] = useState(""),
    [closes, setCloses] = useState(""),
    [confirmName, setConfirmName] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void supabase!
      .rpc("manage_survey", { target_id: version.id, operation: "inspect" })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const result = data as Inspection;
        setInspection(result);
        setName(result.survey.name);
        setYear(result.survey.reporting_year);
        setOpens(localDate(result.survey.opens_at));
        setCloses(localDate(result.survey.closes_at));
      });
    return () => {
      active = false;
    };
  }, [version.id, attempt]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!inspection || !supabase) return;
    if (remove && !inspection.canDelete) return;
    if (!remove && opens && closes && new Date(closes) <= new Date(opens)) {
      setError("Closing time must be after opening time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.rpc("manage_survey", {
        target_id: version.id,
        operation: remove ? "delete" : "update",
        input: {
          expectedUpdatedAt: inspection.survey.updated_at,
          name,
          year,
          confirmName,
          opensAt: opens ? new Date(opens).toISOString() : null,
          closesAt: closes ? new Date(closes).toISOString() : null,
        },
      });
      if (error) throw error;
      await saved(remove);
    } catch (e) {
      setError(
        e && typeof e === "object" && "message" in e
          ? String(e.message)
          : "Unable to update survey",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={remove ? "Delete draft survey" : "Survey details"}
      close={close}
      dismissible={!busy}
    >
      {!inspection ? (
        <div>
          <p role="status">{error || "Checking survey dependencies…"}</p>
          {error && (
            <Button variant="secondary" onClick={() => setAttempt((v) => v + 1)}>
              Retry
            </Button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {remove ? (
            <>
              <p className="break-words text-sm leading-6">
                <strong>{inspection.survey.name}</strong> · {inspection.survey.reporting_year}
              </p>
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6">
                {inspection.canDelete
                  ? "This unused draft and its questions will be deleted permanently. Shared question definitions and the audit record are retained."
                  : `This survey cannot be deleted. Status: ${inspection.survey.status}; reports: ${inspection.reports}. Published surveys or surveys used in reports or analysis must be retained. Use Close survey in its workspace instead.`}
              </p>
              {inspection.canDelete && (
                <label className="block text-sm font-semibold">
                  Type the full survey name to confirm
                  <input
                    className={field}
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    autoComplete="off"
                    disabled={busy}
                  />
                </label>
              )}
            </>
          ) : (
            <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">
                Survey name
                <input
                  className={field}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <label className="text-sm font-semibold">
                Reporting year
                <input
                  className={field}
                  type="number"
                  min={2020}
                  max={2200}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  required
                  disabled={inspection.survey.status !== "draft" || inspection.reports > 0}
                />
              </label>
              <p className="self-end text-sm leading-6 text-slate-500">
                Reporting year is locked once published or used in a report. Schedule times use your
                local timezone.
              </p>
              <label className="text-sm font-semibold">
                Opens at
                <input
                  className={field}
                  type="datetime-local"
                  value={opens}
                  onChange={(e) => setOpens(e.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Closes at
                <input
                  className={field}
                  type="datetime-local"
                  value={closes}
                  min={opens || undefined}
                  onChange={(e) => setCloses(e.target.value)}
                />
              </label>
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <footer className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                (remove && (!inspection.canDelete || confirmName !== inspection.survey.name))
              }
            >
              {busy ? "Saving…" : remove ? "Delete draft" : "Save details"}
            </Button>
          </footer>
        </form>
      )}
    </Dialog>
  );
}
