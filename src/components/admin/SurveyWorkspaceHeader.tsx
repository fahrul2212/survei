import { ArrowLeft, Eye, EyeOff, Plus, Send, XCircle } from "lucide-react";
import { surveyDisplayTitle, type SurveyVersion } from "../../lib/portal";
import { Button, PageHeader, StatusBadge } from "../ui";

export function SurveyWorkspaceHeader({
  version,
  questionCount,
  previewMode,
  busy,
  onBack,
  onTogglePreview,
  onAddQuestion,
  onPublish,
  onClose,
}: {
  version: SurveyVersion;
  questionCount: number;
  previewMode: boolean;
  busy: boolean;
  onBack: () => void;
  onTogglePreview: () => void;
  onAddQuestion: () => void;
  onPublish: () => void;
  onClose: () => void;
}) {
  const draft = version.status === "draft";
  const empty = questionCount === 0;

  return (
    <>
      <Button icon={ArrowLeft} size="small" variant="ghost" className="mb-5" onClick={onBack}>
        Reporting years
      </Button>
      <PageHeader
        compact
        eyebrow={`Reporting year ${version.reporting_year}`}
        title={surveyDisplayTitle(version.name)}
        meta={(
          <>
            <span>{questionCount} {questionCount === 1 ? "question" : "questions"}</span>
            <StatusBadge status={version.status} />
          </>
        )}
        actions={(
          <>
            <Button
              icon={previewMode ? EyeOff : Eye}
              onClick={onTogglePreview}
              disabled={empty}
              aria-pressed={previewMode}
              title={empty ? "Add a question before previewing" : undefined}
            >
              {previewMode ? "Exit preview" : "Preview"}
            </Button>
            {draft && !empty && (
              <Button icon={Plus} onClick={onAddQuestion}>Add question</Button>
            )}
            {draft && (
              <Button
                icon={Send}
                variant="primary"
                disabled={empty || busy}
                onClick={onPublish}
                title={empty ? "Add at least one question before publishing" : undefined}
              >
                {busy ? "Publishing…" : "Publish year"}
              </Button>
            )}
            {version.status === "published" && (
              <Button icon={XCircle} variant="danger" disabled={busy} onClick={onClose}>
                {busy ? "Closing…" : "Close year"}
              </Button>
            )}
          </>
        )}
      />
    </>
  );
}
