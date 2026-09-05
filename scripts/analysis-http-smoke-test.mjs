import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertPackage, closeSessions, login, origin, request } from "./analysis-live-support.mjs";

// Uses existing synthetic reports; never seeds, publishes mappings, or changes AI settings.
// --preflight is read-only; --ai makes one provider request, with no automatic retry.
try {
  const admin = await login("TEST_ADMIN");
  const settings = await request(admin.token, "/api/ai/settings");
  assert.equal(settings.status, 200);
  const catalog = await request(admin.token, "/api/v2/analysis/mappings");
  const ai = {
    enabled: settings.data.settings.enabled,
    configured: settings.data.credential.configured,
    model: settings.data.settings.defaultModel,
  };
  if (process.argv.includes("--preflight")) {
    console.log(JSON.stringify({ origin, apiStatus: catalog.status, ai }));
  } else {
    assert.equal(catalog.status, 200, "Deploy the v2 API and migrations before this test");
    const company = await login("TEST_CLIENT");
    const scope = {
      years: [2024],
      surveyVersionIds: [],
      organizationIds: [],
      questionKeys: ["CTP25-006"],
      metricCodes: [],
      datasetMode: "synthetic",
      cohortMode: "available_each_year",
    };
    const key = randomUUID();
    const first = await request(admin.token, "/api/v2/analysis", scope, key);
    assert.equal(first.status, 200);
    assert.equal(first.data.state, "ready");
    assertPackage(first.data.result);
    assert.ok(
      first.data.result.charts.length,
      "Publish a reviewed synthetic metric before chart verification",
    );
    assert.ok(first.data.result.evidence.every((row) => row.year === 2024));
    const replay = await request(admin.token, "/api/v2/analysis", scope, key);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data, first.data, "Idempotent replay changed the saved result");
    const own = await request(company.token, "/api/v2/analysis", scope, randomUUID());
    assert.equal(own.status, 200);
    assertPackage(own.data.result);
    assert.ok(
      own.data.result.evidence.every(
        (row) =>
          row.scope === "anonymous_group" ||
          (row.scope === "own_answer" && row.organization === "Your company"),
      ),
    );
    assert.equal(own.data.result.dataQuality, undefined);
    assert.equal((await request(company.token, `/api/v2/analysis/${first.data.id}`)).status, 403);
    assert.equal(
      (
        await request(
          company.token,
          "/api/v2/analysis",
          {
            ...scope,
            organizationIds: [1],
          },
          randomUUID(),
        )
      ).status,
      403,
    );
    assert.equal((await request(undefined, "/api/v2/analysis", scope, randomUUID())).status, 401);
    const trend = await request(
      admin.token,
      "/api/v2/analysis",
      {
        ...scope,
        years: [2024, 2025],
        cohortMode: "matched_panel",
      },
      randomUUID(),
    );
    assert.equal(trend.status, 200);
    assertPackage(trend.data.result);
    assert.ok(trend.data.result.facts.some((fact) => fact.baselineYear === 2024));
    if (process.argv.includes("--ai")) {
      assert.ok(ai.enabled && ai.configured, "AI is not enabled and configured");
      const explained = await request(admin.token, `/api/v2/analysis/${first.data.id}/narrative`, {
        question:
          "Explain the selected synthetic measurements and limitations. Reference their verified sources.",
      });
      assert.equal(explained.status, 200, "Provider attempt failed; do not automatically retry");
      assert.equal(explained.data.narrativeState, "ready", "Explanation did not pass verification");
      const factIds = new Set(first.data.result.facts.map((row) => row.id));
      const evidenceIds = new Set(first.data.result.evidence.map((row) => row.id));
      assert.ok(explained.data.narrative.findings.length);
      for (const finding of explained.data.narrative.findings) {
        assert.ok(finding.factIds.every((id) => factIds.has(id)));
        assert.ok(finding.evidenceIds.every((id) => evidenceIds.has(id)));
      }
      ai.generated = true;
      ai.elapsedMs = explained.elapsedMs;
    }
    console.log(
      JSON.stringify({
        origin,
        passed: true,
        analysisMs: first.elapsedMs,
        charts: first.data.result.charts.length,
        companyAccess: "isolated",
        ai,
      }),
    );
  }
} finally {
  await closeSessions();
}
