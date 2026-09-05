# Survey parity and analysis release — 5 September 2026

## Source and preservation

The reference is [CTP25-copy on SurveyMonkey](https://www.surveymonkey.com/r/CTP25-copy). All 32 pages were inspected with temporary dummy answers under the owner's instruction; the final Done/Submit action was never used. The verified catalog contains 92 numbered questions, not the previous 18-page approximation. Forward navigation with No was also checked at Q21, Q31, Q40, Q50, Q60, Q65, Q68, Q81 and Q83. Those answers did not skip the following pages in this copy, so no inferred branching rules are applied.

`data/ctp25-catalog.json` stores exact prompts, options, source IDs, order, page grouping and observed input metadata. Q1 has six contact fields, Q2 has three, Q42–46 have four supplier-tier matrix rows each, and challenge questions retain their separate subfields. Optional choice comments and HTTPS reference links are retained. Per-field required flags follow the captured source markup; server submission to SurveyMonkey was intentionally not used to probe hidden validation rules.

The original closed 2025 survey (version 26), eight submitted example reports and their 736 answers remain intact. The matched questionnaire is a separate **draft version 28**, named **Copy of STICA Signatory's Survey 2025 - Climate Transition Plans**. It is not published. Stable question identities are reused through new revisions, without rewriting old response wording/types. Carry-forward mappings are not automatically enabled where the old structure differed.

## Maintenance

- `scripts/extract-survey-catalog.py` converts inspected page HTML into the catalog. It expects the local capture at `tmp/survey-source/pages.json` and Python with lxml. Captures are ignored; the reviewed catalog is the durable source artifact.
- `node scripts/sync-survey-catalog.mjs` previews the update. `--apply` creates or resumes a draft via authenticated admin RPCs and refuses published/closed surveys or drafts with answers. Review the plan before applying; do not use it as a recurring seed against an occupied reporting cycle.
- The builder exposes subfield labels/types/required flags, options and conditional comment fields. Question keys remain stable when labels change.
- Historical import matches normalized verified prompts or explicit source aliases. A same-count unrelated questionnaire is rejected instead of being mapped by position. Structured fields, matrix rows and comments are preserved.

## Runtime changes

Shared answer validation and controls serve both preview and company reporting. The autosave queue serializes writes, preserves the newest edit, retries failures and flushes before submission. A review dialog groups answers by section and links validation failures back to the question. The database independently validates visible answers on submission, including structured email fields, allowed choices and required comments. Progress views and completion benchmarks use the same recursive value check so empty contact objects, empty selections with comments, and archived text alone do not inflate completion. Existing snapshots are unaffected.

Email previews and all four invitation/reminder functions use one escaped renderer. The iframe preview has no script permissions and never sends mail. The delivered-test action is explicitly labelled as using the saved template.

Admin analysis supports all years, selected years, selected companies and selected stable question IDs. Company queries use their own detail and eligible anonymous all-company statistics. Numeric averages/medians and choice distributions are calculated in the Worker, independently of AI prose. Distinct surveys within one year remain separate. Historical text fields are not guessed to be numeric merely to produce a chart. AI source references expand the authorized evidence used for the response.

The configured cohort minimum is bounded below by three and increased by one for company-facing statistics to protect other contributors when the caller contributes. Small positive or complementary choice cells suppress the whole distribution. No peer free text enters company evidence. Selection and row limits return an explicit error rather than dropping answers silently.

## Verification

- `npm test`: 15 tests covering catalog identity, import mapping, structured validation, concurrent saves, retry, conflict resolution, publish preflight, archive selection, escaped email, aggregate privacy and explicit context limits.
- `npm run build`: TypeScript and production build pass; admin and company screens load as separate bundles.
- `node --import ./scripts/test-typescript.mjs scripts/analysis-smoke-test.mjs`: reads all 736 example answers, checks selected scope and company evidence boundaries.
- `node scripts/role-smoke-test.mjs`: 19 live role checks pass, including SQL permission denial with correct admin RPC arguments.
- `node scripts/analysis-http-smoke-test.mjs`: live admin selection/all-year charts, company anonymization, forbidden company filters and anonymous denial pass. This command does not call an external AI provider. The optional `--ai` flag must only be used with authorization for the test payload/provider.
- `tests/database-answer-validation.sql`: database validation assertions passed in a rollback-only transaction before migration application.
- Browser checks cover contact fields and matrix layouts at 1600×900, 1024×768 and 390×844, including horizontal-overflow checks and unsaved email previews.

Migrations `20260905060000_structured_answer_validation.sql` and `20260905070000_structured_answer_progress.sql`, plus the four shared-renderer email functions, were applied. Frontend and Worker were deployed directly with Wrangler and checked on the live custom domain. GitHub CI has the unit-test gate added but was not triggered by this direct deployment. No survey publication, final SurveyMonkey submission or test email was performed. AI configuration is active; external generation verification requires the separately requested payload approval. These checks are scoped release verification, not a completed exhaustive security audit.

## Reporting flow follow-up

Migration `20260905072655_report_flow_integrity.sql` adds optimistic concurrency tokens and explicit review timestamps. Company answer writes go through `save_report_answer`, which locks the submission, checks company contributor access, active organization, published survey, question ownership and the expected answer version. A conflict preserves both edits until the user chooses. Direct company answer writes cannot bypass this check. All updates, including administrative imports, advance the token. SQL null is normalized to a JSON null so clearing an answer remains supported.

Submitting a closed cycle is rejected independently of the UI. Visible carried-forward answers must be confirmed or edited before a company can submit; submitted historical records remain unchanged. `tests/database-report-flow.sql` passed in a rollback-only transaction, covering stale versions, cross-company access, viewers, direct-write denial, review, clearing answers, resume location and closed/submitted report protection. No fixture organizations remain. Live role checks passed 19/19; analysis HTTP checks passed without an external AI call.

The dashboard falls back to archived surveys and labels them explicitly. Company login only reads reports; starting a report is an explicit action. Existing report status is refreshed when opening it. URL state preserves portal navigation, report page and analysis selections; answer content and AI query text are never stored in the URL. The most recently saved answer also updates the server resume section. Mobile reporting uses a page selector and sticky actions. Validation links focus the affected input. Print review and conflict review use native accessible dialogs.

Publish/close/reopen now require a review dialog; publish preflight checks question fields, choices, dates and earlier-question display dependencies. Import preview shows target survey identity, full per-company mapped answers, warnings and existing submissions that will be skipped. Long-format imports show a 30-row sample and explicitly state their update policy; incomplete identities and duplicate import keys are rejected. Question benchmarks distinguish absent reports, absent own submissions, unavailable comparable answers and privacy suppression. Company cohorts include active organizations only; question response counts can differ, and the displayed threshold includes protection for the caller's own contribution.

Live desktop/tablet/mobile checks verified archive counts, publish dialog layout and disabled confirmation, zero horizontal page overflow and zero gradients. Local component QA (without database writes) verified invalid-email focus, review-gated submit, conflict dialog layout and restoring the current report page. Source survey version 28 remains a draft. Changes are deployed directly; the working tree has not been committed or pushed.

Final flow release: Cloudflare Worker version `b1c0f29c-f229-4cc9-8f00-dfd84f008d55`. Database lint on `public` and `app_private` completed without errors. Final source whitespace check passed with Windows CRLF handling. Accounts without an existing report and without an open cycle no longer see an archived question counter or a past submission deadline in their main navigation/overview. Benchmark search controls are hidden until comparable questions exist.

## 2024 test data and workflow optimization

The follow-up release is Worker version `9e8c4f96-be0f-45e5-b385-b6679a4be438`. Document features remain deferred. External AI generation remains untested at the user's request; verification calls only the deterministic analysis endpoint.

Survey version 32, `[TEST DATA] STICA Climate Transition Plans 2024`, is closed and contains 92 questions, eight submitted synthetic company reports and 736 answers. It uses the same synthetic companies and question revisions as legacy version 26 for comparable year tests. It does not replace the verified version 28 draft or rewrite 2025 answers. `node scripts/seed-test-2024.mjs` defaults to a rollback preview; `--apply` seeds once and leaves recognized existing fixtures untouched. The repeat preview verified the existing dataset. Selected test years are clearly labelled in the explorer and trend results.

Reporting now includes question search, filters for correction/review/completion, a shortcut to the next unfinished required item, and optional previous-year answer comparison. Changes in wording, units or answer structures are flagged. Previous answers are read through the signed-in company's database permissions and are never automatically substituted.

Session expiry retains pending report edits in the current tab and presents same-account reauthentication. Saves check the current account before replay; a failed save remains explicitly retryable. This does not persist drafts after closing or reloading the tab. Unit tests cover pending-editor tracking and unauthorized response handling; local browser checks covered the recovery dialog and retained report rendering, not a complete expired-token reauthentication round trip.

Migration `20260905094713_enforce_reporting_deadlines.sql` enforces published state, opening time and the exclusive closing deadline when company submissions are inserted or updated. A rejected answer save rolls back the answer write too. Administrative imports remain allowed. Transactional tests verified future/expired saves, late submission and direct-update denial alongside the earlier conflict and role checks; all test records were rolled back. Post-deployment database lint returned no errors.

Long-format import previews classify new, changed, unchanged and rejected answer values. Existing target answers are read again before import; if they changed, the preview requires review again. This is a preflight check, not an atomic compare-and-swap import. The exact annual archive target is stated, company metadata updates are disclosed, and preview/result JSON downloads are available. Rejected rows block import.

Year comparison tables show averages, absolute change, response counts and units only for matching question structures with one survey per year. They warn that cohort membership can differ, exclude invalid/missing observations, and label independent bar scales. Live deterministic checks verified 16 reports across 2024 and 2025, eight numeric responses per year and matching schemas. Company access restrictions passed 19/19; unit tests passed 20/20 and the production build passed. No external AI call, email or questionnaire publication was performed. This release was deployed directly; changes are not committed or pushed to Git.

Final live comparison checks at 1600×900, 1024×768 and 390×844 found no horizontal page overflow or gradients. The mobile comparison table scrolls within its own container. Local component checks verified question search/filtering, navigation focus, previous-answer display, import differences and recovery-dialog layout. Browser viewport overrides were reset after verification.
