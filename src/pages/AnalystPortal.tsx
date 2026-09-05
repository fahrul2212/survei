import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Organization, SurveyVersion } from "../lib/portal";
import { Button, Loading, NoticeBar, PageContainer, Shell, type Notice } from "../components/ui";
import { AnalysisWorkspace } from "../features/ai-control/analysis-v2/AnalysisWorkspace";
import { api } from "../features/ai-control/api";
import { usePortalView } from "../features/reporting/usePortalView";
import { AccountSettings } from "./AccountSettings";

export function AnalystPortal({ session }: { session: Session }) {
  const [catalog, setCatalog] = useState<{
    versions: SurveyVersion[];
    organizations: Organization[];
  } | null>(null);
  const [notice, setNotice] = useState<Notice>(null),
    [attempt, setAttempt] = useState(0);
  const { view, setView } = usePortalView("ai-explorer", ["ai-explorer", "account"]);
  useEffect(() => {
    let active = true;
    setNotice(null);
    api<{ versions: SurveyVersion[]; organizations: Organization[] }>("/api/internal/catalog")
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((e) => {
        if (active)
          setNotice({
            kind: "error",
            message: e instanceof Error ? e.message : "Unable to load analysis",
          });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <Shell
      view={view}
      setView={setView}
      user={session.user}
      name="Internal analyst"
      accountType="Internal analyst"
      items={[
        ["ai-explorer", "Survey analysis", "analytics"],
        ["account", "My account"],
      ]}
    >
      {notice && (
        <PageContainer>
          <NoticeBar notice={notice} clear={() => setNotice(null)} />
          {!catalog && (
            <Button variant="secondary" onClick={() => setAttempt((v) => v + 1)}>
              Retry
            </Button>
          )}
        </PageContainer>
      )}
      {view === "account" ? (
        <PageContainer>
          <AccountSettings session={session} />
        </PageContainer>
      ) : catalog ? (
        <AnalysisWorkspace
          mode="admin"
          canManageMappings={false}
          versions={catalog.versions}
          organizations={catalog.organizations}
          setNotice={setNotice}
        />
      ) : (
        !notice && <Loading text="Loading internal analysis workspace" />
      )}
    </Shell>
  );
}
