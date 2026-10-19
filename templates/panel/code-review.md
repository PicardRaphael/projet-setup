## Specialist reviewers (repo convention)

In step 4, launch these specialists **in the same message, in the foreground,** as the Standards and Spec sub-agents, only when the diff concerns them:

- `security-reviewer` — the diff touches authentication, permissions, routes or API handlers, data access, configuration, secrets, dependencies or file uploads.
- `ui-reviewer` — the diff touches user-facing code (components, pages, styles, copy). Give it the URL of the running app for this worktree when one is running.

Give each the fixed point and the spec pointer. Report their findings in their own sections, after Standards and Spec, keeping each verdict line (`VERDICT: PASS | CHANGES`).

**Lessons.** When a report has a `## Lesson` section, file each lesson yourself with the memory triage of `.claude/rules/matt-decisions.md`: a mistake implementers repeat in one area goes to `.claude/rules/<area>.md` (with `paths:`), a repo-wide one to CLAUDE.md (one short line), a lasting decision to `docs/adr/`. Skip it if it is already there.
