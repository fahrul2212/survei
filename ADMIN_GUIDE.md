# STICA Reporting Portal - Administrator Guide

## Initial administrator

The first administrator is intentionally not bootstrapped from the public application. Create the user in Supabase Auth and set the user's `app_metadata.role` to `platform_admin`. Sign out and back in after changing app metadata so the JWT refreshes.

## Annual workflow

1. Open **Survey builder** and create the reporting year.
2. Clone the prior year when most questions are unchanged.
3. Review each persistent question ID and its approved carry-forward source.
4. Add new questions with no carry-forward source. When wording changes materially, leave the source blank unless an administrator intentionally approves the mapping.
5. Configure simple visibility conditions with a dependency question ID, operator, and expected value.
6. Publish the draft. Published question sets are immutable.
7. Open **Companies** and send secure invitations.
8. Monitor completion under **Progress**. Submitted reports can be reopened with an audit reason.
9. Export all responses or filter by year, company, or question ID.

## Historical import format

Upload `.xlsx` or `.csv` in long format, with one response per row.

Required columns:

```text
company_name,company_slug,reporting_year,question_key,answer
```

Optional columns:

```text
contact_email,external_reference,question_prompt,question_type,category,section_key,section_title,submitted_at
```

For multiple-choice responses, use a JSON array such as `["Option A","Option B"]`. Question IDs must follow the persistent format such as `GOV-001`.

## Security and ownership

- Company users only see organizations and responses linked through `organization_members`.
- Administrator authorization uses immutable Auth `app_metadata`, never user-editable metadata.
- Secret/service-role keys exist only inside Supabase-managed Edge Functions.
- Submission snapshots and audit events preserve revisions and administrative actions.
- Archive companies instead of deleting historical reporting records.
