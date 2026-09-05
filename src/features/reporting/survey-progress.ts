import { answerIssues, hasAnswer, type JsonAnswer } from "../../../shared/survey-answer";
import type { SurveyQuestion } from "../../lib/portal";
import { sameAnswer } from "../../../shared/question-comparison";

export type SurveyPage = { key: string; title: string; questions: SurveyQuestion[] };

export function hasAnswerEdit(previous: JsonAnswer | undefined, next: JsonAnswer) {
  if (sameAnswer(previous, next) || (!hasAnswer(previous) && !hasAnswer(next))) return false;
  if (typeof previous === "number" && typeof next === "string" && String(previous) === next)
    return false;
  return true;
}

export function groupSurveyPages(questions: SurveyQuestion[]): SurveyPage[] {
  const pages = new Map<string, SurveyPage>();
  for (const question of questions) {
    if (!pages.has(question.sectionKey))
      pages.set(question.sectionKey, {
        key: question.sectionKey,
        title: question.sectionTitle,
        questions: [],
      });
    pages.get(question.sectionKey)!.questions.push(question);
  }
  return [...pages.values()];
}

/** A disappearing branch returns to the preceding visible page, never an unrelated index. */
export function resolveSurveyPage(pages: SurveyPage[], selected: string, all: SurveyQuestion[]) {
  if (pages.some((page) => page.key === selected)) return selected;
  const original = [...new Set(all.map((question) => question.sectionKey))];
  const position = original.indexOf(selected);
  return (
    pages.filter((page) => original.indexOf(page.key) < position).at(-1)?.key ?? pages[0]?.key ?? ""
  );
}

export function surveyProgress(
  questions: SurveyQuestion[],
  answers: Record<number, JsonAnswer>,
  provenance: Record<number, string> = {},
  reviewed: Record<number, boolean> = {},
) {
  let answered = 0,
    complete = 0,
    missing = 0,
    correction = 0,
    review = 0,
    optional = 0;
  for (const question of questions) {
    const value = answers[question.id];
    if (!hasAnswer(value)) {
      if (question.required) missing++;
      else optional++;
      continue;
    }
    answered++;
    if (answerIssues(question, value).length) correction++;
    else if (
      provenance[question.id] &&
      provenance[question.id] !== "manual" &&
      !reviewed[question.id]
    )
      review++;
    else complete++;
  }
  return {
    answered,
    complete,
    missing,
    correction,
    review,
    optional,
    ready: missing + correction + review === 0,
  };
}

export function focusSurveyQuestion(id: number, prefix = "report-question") {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const article = document.getElementById(`${prefix}-${id}`);
      article?.scrollIntoView({ block: "start" });
      const controls = [
        ...(article?.querySelectorAll<HTMLElement>("input,textarea,select,button") ?? []),
      ].filter(
        (control) => control.getClientRects().length > 0 && !control.hasAttribute("disabled"),
      );
      (
        controls.find((control) => control.getAttribute("aria-invalid") === "true") ??
        controls[0] ??
        article
      )?.focus({ preventScroll: true });
    }),
  );
}
