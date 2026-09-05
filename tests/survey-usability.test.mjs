import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSurveyPages,
  resolveSurveyPage,
  surveyProgress,
  hasAnswerEdit,
} from "../src/features/reporting/survey-progress.ts";
import { answerReviewLines } from "../src/features/reporting/answer-review.ts";
import { answerIssues } from "../shared/survey-answer.ts";
import { submitReportDraft } from "../src/features/reporting/submit-report.ts";
const question = {
  id: 1,
  sectionKey: "contact",
  sectionTitle: "Contact",
  required: true,
  type: "text",
  validation: {},
  options: [],
};

test("focusing and leaving an unchanged carried-forward answer is not an edit", () => {
  assert.equal(hasAnswerEdit("Previous plan", "Previous plan"), false);
  assert.equal(hasAnswerEdit(12.5, "12.5"), false);
  assert.equal(hasAnswerEdit(undefined, ""), false);
  assert.equal(
    hasAnswerEdit(
      { Name: "Sample", Email: "sample@example.invalid" },
      { Email: "sample@example.invalid", Name: "Sample" },
    ),
    false,
  );
  assert.equal(hasAnswerEdit("Previous plan", "Updated plan"), true);
  assert.equal(hasAnswerEdit("Previous plan", ""), true);
});

test("submission preserves service errors for the review dialog and blocks invalid or unsaved drafts", async () => {
  let calls = 0;
  const input = {
    version: { status: "published", opens_at: null, closes_at: null },
    questions: [question],
    answers: { 1: "Complete" },
    provenance: { 1: "manual" },
    reviewed: {},
    flush: async () => true,
    send: async () => {
      calls++;
      return { error: { message: "Reporting window closed on the server" } };
    },
  };
  await assert.rejects(submitReportDraft(input), /Reporting window closed on the server/);
  assert.equal(calls, 1);
  await assert.rejects(
    submitReportDraft({ ...input, flush: async () => false }),
    /pending changes/,
  );
  await assert.rejects(submitReportDraft({ ...input, answers: {} }), /need correction/);
  await assert.rejects(
    submitReportDraft({ ...input, provenance: { 1: "prefilled" } }),
    /carried-forward/,
  );
  assert.equal(calls, 1);
  await submitReportDraft({ ...input, send: async () => ({ error: null }) });
});

test("inserting an earlier conditional page preserves the active section identity", () => {
  const all = [
    question,
    { ...question, id: 2, sectionKey: "branch" },
    { ...question, id: 3, sectionKey: "metrics" },
  ];
  assert.equal(resolveSurveyPage(groupSurveyPages(all), "metrics", all), "metrics");
  assert.equal(resolveSurveyPage(groupSurveyPages([all[0], all[2]]), "branch", all), "contact");
  assert.equal(resolveSurveyPage([], "branch", all), "");
  assert.equal(resolveSurveyPage(groupSurveyPages(all), "unknown", all), "contact");
});

test("progress excludes invalid and unconfirmed answers while blank optional fields do not block readiness", () => {
  const questions = [
    question,
    {
      ...question,
      id: 2,
      type: "textarea",
      validation: { fields: [{ key: "email", label: "Email", type: "email", required: true }] },
    },
    { ...question, id: 3 },
    { ...question, id: 4, required: false },
  ];
  const state = surveyProgress(
    questions,
    { 1: "Valid", 2: { email: "invalid" }, 3: "Prior answer" },
    { 3: "prefilled" },
  );
  assert.deepEqual(state, {
    answered: 3,
    complete: 1,
    missing: 0,
    correction: 1,
    review: 1,
    optional: 1,
    ready: false,
  });
  const ready = surveyProgress(
    questions,
    { 1: "Valid", 2: { email: "valid@example.invalid" }, 3: "Confirmed" },
    { 3: "prefilled" },
    { 3: true },
  );
  assert.equal(ready.complete, 3);
  assert.equal(ready.optional, 1);
  assert.equal(ready.ready, true);
});

test("submission review uses field labels and excludes archived metadata and inactive conditional comments", () => {
  const structured = {
    ...question,
    validation: { fields: [{ key: "email_key", label: "Email address", type: "email" }] },
  };
  assert.deepEqual(
    answerReviewLines(structured, {
      email_key: "sample@example.invalid",
      _previous: "Archived answer",
    }),
    [{ label: "Email address", text: "sample@example.invalid" }],
  );
  const choice = {
    ...question,
    type: "single_choice",
    options: ["Yes", "No"],
    validation: { comment: { label: "Explain", option: "Yes", required: true } },
  };
  assert.deepEqual(
    answerReviewLines(choice, { selection: "No", comment: "Retained hidden text" }),
    [{ label: "Selected answer", text: "No" }],
  );
  assert.equal(answerReviewLines(choice, { selection: "Yes", comment: "Active text" }).length, 2);
  assert.equal(answerIssues(choice, { selection: "Yes", comment: "" }).length, 1);
});

test("exact numeric input text remains valid without coercing it to a floating point number", () => {
  assert.deepEqual(answerIssues({ ...question, type: "number" }, "9007199254740993.125"), []);
  assert.deepEqual(answerIssues({ ...question, type: "number" }, "0.25"), []);
  assert.deepEqual(answerIssues({ ...question, type: "number" }, "0"), []);
});
