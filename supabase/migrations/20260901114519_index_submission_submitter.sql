create index company_submissions_submitted_by_idx
on public.company_submissions (submitted_by)
where submitted_by is not null;
