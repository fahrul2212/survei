import type { SurveyVersion } from "../../lib/portal";

export function monitoringSurvey(versions: SurveyVersion[], selected: number | null) {
  const available = versions.filter((version) => version.status !== "draft");
  return (
    available.find((version) => version.id === selected) ??
    available.find((version) => version.status === "published") ??
    available[0]
  );
}

export function routeValue(key: string): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get(key);
}

export function rememberRoute(key: string, value: string) {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.set(key, value);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#${params}`,
  );
}
