type Window = { status: string; opens_at: string | null; closes_at: string | null };
export function reportingWindow(version: Window, now = Date.now()) {
  if (version.status !== "published") return version.status === "draft" ? "draft" : "closed";
  if (version.opens_at && Date.parse(version.opens_at) > now) return "scheduled";
  if (version.closes_at && Date.parse(version.closes_at) <= now) return "expired";
  return "open";
}

export function reportingWindowMessage(version: Window, now = Date.now()) {
  switch (reportingWindow(version, now)) {
    case "scheduled":
      return "Reporting has not opened yet.";
    case "expired":
      return "The submission deadline has passed. Contact STICA if you need an extension.";
    case "draft":
      return "This survey has not been published.";
    case "closed":
      return "This reporting cycle is closed.";
    default:
      return "Reporting is open.";
  }
}
