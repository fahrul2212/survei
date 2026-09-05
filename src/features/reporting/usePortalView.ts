import { useCallback, useEffect, useRef, useState } from "react";
import { routeValue } from "./survey-state";

/** Store navigation only in the URL; survey answers never enter browser history. */
export function usePortalView(initial: string, allowed: string[]) {
  const valid = (value: string | null) => (value && allowed.includes(value) ? value : initial);
  const [view, update] = useState(() => valid(routeValue("view")));
  const guard = useRef<() => Promise<boolean>>(async () => true);
  const current = useRef(view);
  current.current = view;
  const setView = useCallback((next: string) => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    params.set("view", next);
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${params}`,
    );
    update(next);
  }, []);
  useEffect(() => {
    const onBack = () => {
      void guard.current().then((saved) => {
        if (saved) update(valid(routeValue("view")));
        else setView(current.current);
      });
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [initial, allowed.join("|"), setView]);
  return { view, setView, guard };
}
