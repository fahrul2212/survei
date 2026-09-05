import { useEffect, useState } from "react";
import type { JsonAnswer, SurveyQuestion } from "../../lib/portal";
import { SaveQueue, type SaveState } from "./save-queue";
import { protectPendingEdits } from "../../lib/session-recovery";

type PendingAnswer = { write: () => Promise<void> };

export function useAnswerAutosave(
  save: (question: SurveyQuestion, value: JsonAnswer) => Promise<void>,
) {
  const [state, setState] = useState<SaveState>("saved");
  const [queue] = useState(() => new SaveQueue<PendingAnswer>((item) => item.write(), setState));
  useEffect(() => {
    const release = protectPendingEdits(() => queue.unsaved);
    const warn = (event: BeforeUnloadEvent) => {
      if (queue.unsaved) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      release();
      window.removeEventListener("beforeunload", warn);
      void queue.flush();
    };
  }, [queue]);

  return {
    state,
    enqueue: (question: SurveyQuestion, value: JsonAnswer) =>
      queue.enqueue(question.id, { write: () => save(question, value) }),
    flush: () => queue.flush(),
    retry: () => queue.retry(),
    discard: (id: number) => queue.discard(id),
  };
}
