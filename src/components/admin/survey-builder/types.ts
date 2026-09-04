import type { Dispatch, SetStateAction } from "react";
import type { Notice } from "../../ui";
import type { SurveyQuestion, SurveyVersion } from "../../../lib/portal";

export type SurveyBuilderProps = {
  versions: SurveyVersion[];
  questions: SurveyQuestion[];
  carry: Record<number, string>;
  selected: number | null;
  busy: boolean;
  qSearch: string;
  qSectionFilter: string;
  setQSearch: Dispatch<SetStateAction<string>>;
  setQSectionFilter: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<Notice>>;
  setSelected: Dispatch<SetStateAction<number | null>>;
  setQuestions: Dispatch<SetStateAction<SurveyQuestion[]>>;
  loadQuestions: (versionId: number) => Promise<void>;
  load: (silent?: boolean, preferredId?: number) => Promise<void>;
};
