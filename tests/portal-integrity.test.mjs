import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SaveQueue } from "../src/features/reporting/save-queue.ts";
import { answerIssues, hasAnswer } from "../shared/survey-answer.ts";
import { matchQuestion, importBlock } from "../shared/survey-import.ts";
import { renderEmailTemplate, validateEmailTemplate } from "../shared/email-template.ts";

const catalog = JSON.parse(
  readFileSync(new URL("../data/ctp25-catalog.json", import.meta.url), "utf8"),
);
const question = (number) => catalog.questions[number - 1];

test("verified survey keeps all 92 identities, 32 pages and original field structures", () => {
  assert.deepEqual(
    catalog.questions.map((q) => q.n),
    Array.from({ length: 92 }, (_, i) => i + 1),
  );
  assert.equal(new Set(catalog.questions.map((q) => q.sectionKey)).size, 32);
  assert.equal(question(1).validation.fields.length, 6);
  assert.equal(question(2).validation.fields.length, 3);
  for (const number of [42, 43, 44, 45, 46])
    assert.equal(question(number).validation.fields.length, 4);
  assert.equal(question(15).type, "textarea");
  assert.ok(question(15).required && question(17).required);
  assert.ok(catalog.questions.every((q) => Object.keys(q.visibilityRule).length === 0));
  assert.equal(question(38).options.length, 14);
});

test("imports match wording despite reordered question blocks and reject unrelated same-count surveys", () => {
  assert.equal(
    matchQuestion(`99. ${question(50).prompt}`, catalog.questions).stableKey,
    "CTP25-050",
  );
  assert.equal(
    matchQuestion(question(24).validation.sourcePromptAliases[0], catalog.questions).n,
    24,
  );
  assert.throws(() => matchQuestion("1. How many offices?", catalog.questions), /mapping stopped/);
});

test("contact, matrix and choice comments survive importing", () => {
  assert.deepEqual(
    importBlock(
      [
        { label: "Email Address:", value: "a@example.com" },
        { label: "Legacy field:", value: "retained" },
      ],
      question(1),
    ),
    { "Email Address": "a@example.com", "Legacy field": "retained" },
  );
  assert.deepEqual(
    importBlock(
      [
        { label: "Tier 1 Suppliers:", value: "1-25%" },
        { label: "Tier 2 Suppliers:", value: "0%" },
      ],
      question(42),
    ),
    { "Tier 1 Suppliers": "1-25%", "Tier 2 Suppliers": "0%" },
  );
  assert.deepEqual(
    importBlock(
      [
        { label: "Response", value: question(3).options[2] },
        { label: "Other (please specify)", value: "Manufacturer" },
      ],
      question(3),
    ),
    { selection: question(3).options[2], comment: "Manufacturer" },
  );
  assert.throws(
    () => importBlock([{ label: "Response", value: "Unknown option" }], question(8)),
    /Unrecognised/,
  );
});

test("structured validation catches invalid email and does not count archived text as complete", () => {
  assert.ok(
    answerIssues(question(1), { "Email Address": "invalid" }).some((issue) =>
      issue.includes("valid"),
    ),
  );
  assert.equal(hasAnswer({ _previous: "old contact" }), false);
  assert.equal(hasAnswer({ selection: [], comment: "comment alone" }), false);
  assert.equal(hasAnswer(0), true);
  const withComment = {
    required: true,
    type: "single_choice",
    options: ["Other"],
    validation: { comment: { required: true, option: "Other" } },
  };
  assert.ok(answerIssues(withComment, { selection: "Other", comment: "" }).length);
  assert.deepEqual(answerIssues(withComment, { selection: "Other", comment: "Explanation" }), []);
  assert.ok(answerIssues(withComment, ["Other"]).length);
});

test("concurrent flushes serialize saves and the latest edit wins", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const writes = [];
  let active = 0;
  const queue = new SaveQueue(
    async (value) => {
      assert.equal(++active, 1);
      if (value === "first") await gate;
      writes.push(value);
      active--;
    },
    () => {},
  );
  queue.enqueue(1, "first");
  const one = queue.flush();
  const two = queue.flush();
  queue.enqueue(1, "second");
  queue.enqueue(1, "latest");
  release();
  assert.deepEqual(await Promise.all([one, two]), [true, true]);
  assert.deepEqual(writes, ["first", "latest"]);
  assert.equal(queue.unsaved, false);
});

test("failed saves remain retryable without overwriting newer edits", async () => {
  let fail = true;
  const saved = [];
  const queue = new SaveQueue(
    async (value) => {
      if (fail) throw new Error("offline");
      saved.push(value);
    },
    () => {},
  );
  queue.enqueue(1, "old");
  assert.equal(await queue.flush(), false);
  fail = false;
  queue.enqueue(1, "new");
  assert.equal(await queue.retry(), true);
  assert.deepEqual(saved, ["new"]);
});

test("email renderer escapes template and recipient HTML, strips header newlines and requires body link", () => {
  const rendered = renderEmailTemplate(
    { subject: "Hi {{name}}", body: "<img src=x> {{name}} {{action_url}}" },
    { name: "<script>\r\nBcc: x", action_url: "https://example.com/?a=1&b=2" },
    { value: "https://example.com/?a=1&b=2", label: "Open" },
  );
  assert.ok(!rendered.html.includes("<script>") && !rendered.html.includes("<img"));
  assert.ok(!rendered.subject.includes("\n"));
  assert.match(rendered.html, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.ok(validateEmailTemplate("invitation", { subject: "{{action_url}}", body: "No link" }));
});
