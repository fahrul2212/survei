import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog } from "../../components/common/Dialog";
import { Button } from "../../components/ui";
import type { JsonAnswer, SurveyQuestion } from "../../lib/portal";
import { questionTask } from "./question-task";

type Props = {
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  provenance: Record<number, string>;
  reviewed: Record<number, boolean>;
  readOnly: boolean;
  disabled?: boolean;
  jump: (question: SurveyQuestion) => Promise<boolean>;
};
const labels = {
  all: "All questions",
  unanswered: "Unanswered",
  correction: "Needs correction",
  review: "Needs review",
  complete: "Complete",
};

export function ReportTasks(props: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<keyof typeof labels>("all");
  const [search, setSearch] = useState("");
  const rows = props.questions.map((question) => ({
    question,
    status: questionTask(
      question,
      props.answers[question.id],
      props.provenance[question.id],
      props.reviewed[question.id],
    ),
  }));
  const next = rows.find(
    (row) => row.status !== "complete" && (row.question.required || row.status !== "unanswered"),
  );
  const visible = rows.filter(
    (row) =>
      (filter === "all" || row.status === filter) &&
      `${row.question.stableKey} Q${row.question.displayOrder} ${row.question.prompt} ${row.question.sectionTitle}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  async function jump(question: SurveyQuestion) {
    if (await props.jump(question)) setOpen(false);
  }
  return (
    <div className="mb-5 grid gap-2">
      <Button
        variant="secondary"
        icon={Search}
        disabled={props.disabled}
        onClick={() => setOpen(true)}
      >
        Find questions
      </Button>
      {!props.readOnly && next && (
        <Button
          variant="secondary"
          disabled={props.disabled}
          onClick={() => void jump(next.question)}
        >
          Continue unfinished
        </Button>
      )}
      {open && (
        <Dialog title="Find a question" close={() => setOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Search questions
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Question, ID or page"
                className="min-h-11 min-w-0 rounded border border-slate-300 px-3"
              />
            </label>
            {!props.readOnly && (
              <label className="grid gap-2 text-sm font-semibold">
                Show
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as keyof typeof labels)}
                  className="min-h-11 min-w-0 rounded border border-slate-300 bg-white px-3"
                >
                  {Object.entries(labels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label} (
                      {key === "all" ? rows.length : rows.filter((r) => r.status === key).length})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="my-4 text-sm text-slate-500">
            {visible.length} matching questions · hidden conditional questions are excluded
          </p>
          <ul className="divide-y divide-slate-200">
            {visible.map(({ question: q, status }) => (
              <li key={q.id}>
                <button
                  className="w-full py-4 text-left hover:bg-slate-50"
                  disabled={props.disabled}
                  onClick={() => void jump(q)}
                >
                  <span className="text-xs text-slate-500">
                    Q{q.displayOrder} · {q.sectionTitle}
                    {!props.readOnly ? ` · ${labels[status]}` : ""}
                  </span>
                  <strong className="mt-1 block text-sm leading-6">{q.prompt}</strong>
                </button>
              </li>
            ))}
          </ul>
          {!visible.length && (
            <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm">
              No questions match. Try a different search or filter.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
