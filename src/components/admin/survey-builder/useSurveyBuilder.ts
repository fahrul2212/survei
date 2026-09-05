import { useEffect, useMemo, useState, type FormEvent } from "react";
import { slugify, type SurveyQuestion, type SurveyVersion } from "../../../lib/portal";
import { supabase } from "../../../lib/supabase";
import {
  EMPTY_QUESTION,
  createYearDraft,
  duplicateQuestionForm,
  editQuestionForm,
  errorMessage,
  getSurveySections,
  incrementStableKey,
  isQuestionFormValid,
  newQuestionForm,
  nextStableKey,
  questionValidation,
  type QuestionForm,
  type SurveyBuilderView,
} from "./model";
import type { SurveyBuilderProps } from "./types";
import { usePreviousQuestions } from "./usePreviousQuestions";
import { publishChecks } from "./publish-checks";

export function useSurveyBuilder(props: SurveyBuilderProps) {
  const {
    versions,
    questions,
    carry,
    selected,
    busy,
    qSearch,
    qSectionFilter,
    setBusy,
    setNotice,
    setQSectionFilter,
    setSelected,
    setQuestions,
    loadQuestions,
    load,
  } = props;
  const [view, setView] = useState<SurveyBuilderView>("overview");
  const [form, setForm] = useState<QuestionForm>(EMPTY_QUESTION);
  const [yearDraft, setYearDraft] = useState(() => createYearDraft(versions));
  const [openingVersion, setOpeningVersion] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SurveyQuestion | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [cloneFrom, setCloneFrom] = useState("");
  const [pendingLifecycle, setPendingLifecycle] = useState<"publish" | "close" | "reopen" | null>(
    null,
  );

  const selectedVersion = versions.find((version) => version.id === selected);
  const previous = usePreviousQuestions(versions, selectedVersion);
  const sections = useMemo(() => getSurveySections(questions), [questions]);
  const filteredQuestions = useMemo(() => {
    const search = qSearch.trim().toLowerCase();
    return questions.filter(
      (question) =>
        (!search ||
          question.prompt.toLowerCase().includes(search) ||
          question.stableKey.toLowerCase().includes(search)) &&
        (!qSectionFilter || question.sectionKey === qSectionFilter),
    );
  }, [qSearch, qSectionFilter, questions]);

  useEffect(() => {
    if (sections.length && !qSectionFilter) setQSectionFilter(sections[0][0]);
  }, [qSectionFilter, sections, setQSectionFilter]);

  const nextKey = () => nextStableKey(questions, selectedVersion);

  function beginCreateSurvey() {
    setCloneFrom("");
    setYearDraft(createYearDraft(versions));
    setNotice(null);
    setView("create-year");
  }
  function beginDuplicateSurvey(version: SurveyVersion) {
    setCloneFrom(String(version.id));
    setYearDraft({year:String(version.reporting_year),name:`${version.name} (copy)`});
    setNotice(null);setView("create-year");
  }

  function beginAddQuestion() {
    const section = sections.find(([key]) => key === qSectionFilter) ?? sections[0];
    setForm(newQuestionForm(nextKey(), section));
    setView("question");
  }

  function beginNewPage() {
    setForm({ ...newQuestionForm(nextKey()), sectionKey: "", sectionTitle: "", category: "" });
    setView("question");
  }

  function cancelQuestion() {
    setForm(EMPTY_QUESTION);
    setView("workspace");
  }

  async function openVersion(version: SurveyVersion) {
    setBusy(true);
    setOpeningVersion(version.id);
    setNotice(null);
    setSelected(version.id);
    setQuestions([]);
    setForm(EMPTY_QUESTION);
    setPreviewMode(false);
    setView("workspace");
    try {
      await loadQuestions(version.id);
    } catch (error) {
      setView("overview");
      setNotice({ kind: "error", message: errorMessage(error, "Unable to open reporting year") });
    } finally {
      setOpeningVersion(null);
      setBusy(false);
    }
  }

  async function createSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const result = await supabase.rpc("create_survey_year", {
        new_reporting_year: Number(data.get("year")),
        survey_name: String(data.get("name")),
        open_at: data.get("opens") ? new Date(String(data.get("opens"))).toISOString() : null,
        close_at: data.get("closes") ? new Date(String(data.get("closes"))).toISOString() : null,
        clone_from_survey_version_id: data.get("clone") ? Number(data.get("clone")) : null,
      });
      if (result.error) throw result.error;
      const versionId = Number(result.data);
      setSelected(versionId);
      await load(true, versionId);
      setView("workspace");
      setNotice({
        kind: "success",
        message: `Draft survey for ${yearDraft.year} created. You can now add or review questions.`,
      });
    } catch (error) {
      const duplicate =
        error && typeof error === "object" && "code" in error && error.code === "23505";
      setNotice({
        kind: "error",
        message: duplicate
          ? `A survey named “${yearDraft.name}” already exists for ${yearDraft.year}. Use a different survey name.`
          : errorMessage(error, "Unable to create survey"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selected) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const addAnother = form.id === null && submitter?.value === "another";
    const savedPage = {
      sectionKey: form.sectionKey,
      sectionTitle: form.sectionTitle,
      category: form.category,
    };
    setBusy(true);
    setNotice(null);
    try {
      const result = await supabase.rpc("save_survey_question", {
        target_survey_version_id: selected,
        target_survey_question_id: form.id,
        stable_question_key: form.stableKey.toUpperCase(),
        question_category: form.category,
        question_prompt: form.prompt,
        question_help_text: form.help,
        response_type: form.type,
        response_options: form.options
          .split("\n")
          .map((option) => option.trim())
          .filter(Boolean),
        response_validation: questionValidation(form),
        required_response: form.required,
        target_section_key: slugify(form.sectionKey),
        target_section_title: form.sectionTitle,
        target_visibility_rule: form.condition
          ? {
              questionKey: form.condition.toUpperCase(),
              operator: form.operator,
              ...(form.operator === "is_answered" ? {} : { value: form.expected }),
            }
          : {},
        carry_source_question_key: form.carry.toUpperCase() || null,
      });
      if (result.error) throw result.error;
      await loadQuestions(selected);
      if (addAnother) {
        setForm({
          ...EMPTY_QUESTION,
          stableKey: incrementStableKey(form.stableKey) ?? nextKey(),
          ...savedPage,
        });
        setQSectionFilter(savedPage.sectionKey);
        setNotice({ kind: "success", message: "Question saved. Add the next question." });
      } else {
        cancelQuestion();
        setNotice({ kind: "success", message: "Question saved." });
      }
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error, "Unable to save question") });
    } finally {
      setBusy(false);
    }
  }

  function editQuestion(question: SurveyQuestion) {
    setForm(editQuestionForm(question, carry[question.id]));
    setView("question");
  }

  function duplicateQuestion(question: SurveyQuestion) {
    setForm(duplicateQuestionForm(question, nextKey()));
    setNotice(null);
    setView("question");
  }

  async function removeQuestion(question: SurveyQuestion) {
    if (!supabase || selectedVersion?.status !== "draft") return;
    const client = supabase;
    await runAction(
      () => client.rpc("delete_survey_question", { target_survey_question_id: question.id }),
      async () => {
        await loadQuestions(selectedVersion.id);
        setPendingDelete(null);
        setNotice({ kind: "success", message: `${question.stableKey} removed from the draft.` });
      },
      "Unable to delete question",
    );
  }

  async function reorderQuestion(question: SurveyQuestion, direction: "up" | "down") {
    if (!supabase || selectedVersion?.status !== "draft") return;
    const client = supabase;
    await runAction(
      () =>
        client.rpc("reorder_survey_question", {
          target_survey_question_id: question.id,
          direction,
        }),
      () => loadQuestions(selectedVersion.id),
      "Unable to reorder question",
      false,
    );
  }

  function updateLifecycle(action: "publish" | "close" | "reopen") {
    setPendingLifecycle(action);
  }

  async function confirmLifecycle() {
    const action = pendingLifecycle;
    if (!action) return;
    if (!supabase || !selectedVersion) return;
    if (action !== "close" && publishChecks(selectedVersion, questions).length) return;
    const client = supabase;
    const config = {
      publish: ["publish_survey_version", "Survey published. Companies can now access it."],
      close: ["close_survey_year", "Survey closed. It remains available in the archive."],
      reopen: ["reopen_survey_version", "Survey reopened. Companies can access it again."],
    } as const;
    const [rpc, success] = config[action];
    await runAction(
      () => client.rpc(rpc, { target_survey_version_id: selectedVersion.id }),
      async () => {
        await load(true, selectedVersion.id);
        setPendingLifecycle(null);
        setNotice({ kind: "success", message: success });
      },
      `Unable to ${action} survey`,
    );
  }

  async function runAction(
    request: () => PromiseLike<{ error: unknown }>,
    success: () => void | Promise<void>,
    fallback: string,
    clearNotice = true,
  ) {
    setBusy(true);
    if (clearNotice) setNotice(null);
    try {
      const result = await request();
      if (result.error) throw result.error;
      await success();
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error, fallback) });
    } finally {
      setBusy(false);
    }
  }

  return {
    ...props,
    view,
    setView,
    form,
    setForm,
    yearDraft,
    setYearDraft,
    openingVersion,
    pendingDelete,
    setPendingDelete,
    previewMode,
    setPreviewMode,
    selectedVersion,
    sections,
    filteredQuestions,
    previous,
    canSaveQuestion: isQuestionFormValid(form),
    beginCreateSurvey,
    beginDuplicateSurvey,
    cloneFrom,
    setCloneFrom,
    beginAddQuestion,
    beginNewPage,
    cancelQuestion,
    openVersion,
    createSurvey,
    saveQuestion,
    editQuestion,
    duplicateQuestion,
    removeQuestion,
    reorderQuestion,
    updateLifecycle,
    pendingLifecycle,
    setPendingLifecycle,
    confirmLifecycle,
  };
}

export type SurveyBuilderController = ReturnType<typeof useSurveyBuilder>;
