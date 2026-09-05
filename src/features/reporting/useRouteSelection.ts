import { useEffect, useState } from "react";
import { rememberRoute, routeValue } from "./survey-state";

/** Persist non-sensitive filter selections, never free-form queries or answers. */
export function useRouteSelection<T extends string | number>(
  key: string,
  valid: (value: unknown) => value is T,
) {
  const read = () => {
    try {
      const values: unknown = JSON.parse(routeValue(key) ?? "[]");
      return Array.isArray(values) ? values.filter(valid).slice(0, 100) : [];
    } catch {
      return [];
    }
  };
  const [values, setValues] = useState<T[]>(read);
  useEffect(() => {
    rememberRoute(key, JSON.stringify(values));
  }, [key, values]);
  return [values, setValues] as const;
}
