import type { JsonAnswer } from "../../lib/portal";
import { answerText } from "../../../shared/survey-answer";
import { Dialog } from "../../components/common/Dialog";
import { Button } from "../../components/ui";

export type Conflict = {
  questionId: number;
  prompt: string;
  mine: JsonAnswer;
  saved: JsonAnswer;
  version: number | null;
};
export function AnswerConflict({
  conflict,
  resolve,
  close,
}: {
  conflict: Conflict;
  resolve: (useMine: boolean) => void;
  close: () => void;
}) {
  return (
    <Dialog title="This answer was changed by another user" close={close}>
      <p className="text-sm leading-6 text-slate-600">
        Your edit has not overwritten the saved answer. Compare both versions before continuing.
      </p>
      <h3 className="mt-4 font-semibold">{conflict.prompt}</h3>
      <div className="my-5 grid gap-4 sm:grid-cols-2">
        {[
          ["Your edit", conflict.mine],
          ["Currently saved", conflict.saved],
        ].map(([label, value]) => (
          <section key={String(label)} className="rounded-lg border border-slate-300 p-4">
            <h4 className="mb-2 text-sm font-bold">{String(label)}</h4>
            <p className="whitespace-pre-wrap break-words text-sm">
              {answerText(value as JsonAnswer) || "No answer"}
            </p>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" onClick={() => resolve(false)}>
          Use saved answer
        </Button>
        <Button type="button" variant="primary" onClick={() => resolve(true)}>
          Save my edit instead
        </Button>
      </div>
    </Dialog>
  );
}
