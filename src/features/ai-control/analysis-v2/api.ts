import { api } from "../api";
import type {
  AnalysisRequest,
  AnalysisRun,
  Binding,
  SourceQuestion,
} from "../../../../shared/analysis/contracts";
export type Catalog = {
  actorId: string;
  questions: Array<SourceQuestion & { surveyId: number; surveyName: string; year: number }>;
  proposals: Array<{
    id: string;
    authorId: string;
    status: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  releases: Array<{ id: string; proposalId: string | null; status: string; reason: string }>;
  bindings: Binding[];
};
export const createAnalysis = (scope: AnalysisRequest, key: string) =>
  api<AnalysisRun>("/api/v2/analysis", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(scope),
  });
export const explainAnalysis = (id: string, question: string) =>
  api<AnalysisRun>(`/api/v2/analysis/${id}/narrative`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
export const readAnalysis = (id: string) => api<AnalysisRun>(`/api/v2/analysis/${id}`);
export const getMappings = () => api<Catalog>("/api/v2/analysis/mappings");
export const changeMapping = (body: unknown) =>
  api("/api/v2/analysis/mappings", { method: "POST", body: JSON.stringify(body) });
