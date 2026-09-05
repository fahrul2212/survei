import { CreateSurveyView } from "./survey-builder/CreateSurveyView";
import { DeleteQuestionDialog } from "./survey-builder/DeleteQuestionDialog";
import { QuestionEditorView } from "./survey-builder/QuestionEditorView";
import { SurveyCyclesView } from "./survey-builder/SurveyCyclesView";
import { SurveyWorkspaceView } from "./survey-builder/SurveyWorkspaceView";
import type { SurveyBuilderProps } from "./survey-builder/types";
import { useSurveyBuilder } from "./survey-builder/useSurveyBuilder";
import { SurveyLifecycleDialog } from "./survey-builder/SurveyLifecycleDialog";

export function SurveyBuilder(props: SurveyBuilderProps) {
  const controller = useSurveyBuilder(props);
  const views = {
    overview: <SurveyCyclesView controller={controller} />,
    "create-year": <CreateSurveyView controller={controller} />,
    workspace: <SurveyWorkspaceView controller={controller} />,
    question: <QuestionEditorView controller={controller} />,
  };

  return (
    <>
      <div className="mx-auto w-full max-w-[1480px] px-4 py-7 md:px-8 lg:px-10 lg:pb-20">
        {views[controller.view]}
      </div>
      <DeleteQuestionDialog controller={controller} />
      {controller.pendingLifecycle && <SurveyLifecycleDialog controller={controller} />}
    </>
  );
}
