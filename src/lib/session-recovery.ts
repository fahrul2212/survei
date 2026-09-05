export const SESSION_EXPIRED = "stica:session-expired";
const pendingEditors = new Set<() => boolean>();

export function protectPendingEdits(check: () => boolean) {
  pendingEditors.add(check);
  return () => {
    pendingEditors.delete(check);
  };
}

export function hasPendingEdits() {
  return [...pendingEditors].some((check) => check());
}

export function requestSessionRecovery() {
  window.dispatchEvent(new Event(SESSION_EXPIRED));
}

/** Authentication failures never silently discard an editor's in-memory draft. */
export async function portalFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (response.status === 401 && !url.includes("/auth/v1/")) requestSessionRecovery();
  return response;
}
