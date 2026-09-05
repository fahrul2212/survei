import { useEffect, useMemo, useState } from "react";
import { evaluateVisibility, type JsonAnswer, type SurveyQuestion } from "../../lib/portal";
import { groupSurveyPages, resolveSurveyPage } from "./survey-progress";

export function useSurveyPages(
  questions: SurveyQuestion[],
  answers: Record<number, JsonAnswer>,
  initial = "",
) {
  const [selected, selectPage] = useState(initial);
  const visible = useMemo(
    () => questions.filter((question) => evaluateVisibility(question, questions, answers)),
    [questions, answers],
  );
  const pages = useMemo(() => groupSurveyPages(visible), [visible]);
  const activeKey = resolveSurveyPage(pages, selected, questions);
  useEffect(() => {
    if (activeKey !== selected) selectPage(activeKey);
  }, [activeKey, selected]);
  const activePageIndex = pages.findIndex((page) => page.key === activeKey);
  return { visible, pages, activePage: pages[activePageIndex], activePageIndex, selectPage };
}
