import { valueAsText, type HistoricalImportRow } from "../../lib/portal";
import { Button } from "../../components/ui";
import type { ImportChange } from "./historical-plan";

export function downloadImportReport(name: string, changes: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(changes, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportChanges({
  changes,
  rows,
}: {
  changes: ImportChange[];
  rows: HistoricalImportRow[];
}) {
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="font-bold">Changes before import</h4>
      <p className="my-3 text-sm">
        {["new", "changed", "unchanged", "rejected"]
          .map((status) => `${changes.filter((c) => c.status === status).length} ${status}`)
          .join(" · ")}
      </p>
      <p className="mb-3 text-xs leading-5 text-slate-600">
        Targets are named “Climate Transition Plan Annual Report YEAR”. Other surveys from the same
        year are not overwritten. Company contact details provided in the file may also be updated.
        Existing question definitions are reused.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Inspect changed and rejected rows
        </summary>
        <div className="mt-3 max-h-80 overflow-auto">
          <ul className="divide-y divide-slate-200 text-xs">
            {changes
              .filter((c) => c.status !== "unchanged")
              .map((change) => (
                <li key={change.row} className="py-3">
                  <strong>
                    Row {change.row} · {change.key} · {change.status}
                  </strong>
                  {change.reason ? (
                    <p className="mt-1 text-red-800">{change.reason}</p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <p className="whitespace-pre-wrap break-words">
                        Before: {valueAsText(change.previous) || "No saved answer"}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        After: {valueAsText(rows[change.row - 2].answer) || "No answer"}
                      </p>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      </details>
      <Button
        variant="secondary"
        className="mt-4"
        onClick={() => downloadImportReport("stica-import-preview.json", changes)}
      >
        Download change report
      </Button>
      {changes.some((c) => c.status === "rejected") && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          Correct the rejected rows and upload the file again. Nothing will be imported until every
          row passes.
        </p>
      )}
    </section>
  );
}
