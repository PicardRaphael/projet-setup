## Approval gate (repo convention)

Before step 3 (integration branch and worktrees): run `git status`. Worktree agents only see committed files, so CLAUDE.md, `.claude/` (skills, agents, rules, settings) and `docs/agents/` must be committed; if they have uncommitted changes, ask the user to commit them first.

Between step 4 (an implementer reports done) and step 5 (merge):

1. Review the ticket's branch with the code-review skill against the integration branch (it runs the specialist reviewers when relevant).
2. Launch the `approver` agent in the foreground with the ticket, the spec pointer, the branch and the review reports.
   - `APPROVE` → merge with the merger sub-agent as usual.
   - `REWORK` → resume the same implementer with the approver's list; at most **two** rework rounds per ticket, then treat it as `ESCALATE`.
   - `ESCALATE` (only for the human-reserved categories of `.claude/rules/matt-decisions.md`, or without a majority) → do not merge. Set the ticket's status to `needs-info` (a decision is needed) or `ready-for-human` (a person must act), write the approver's "For the human" section under `## Comments` with options and recommendation, and keep its worktree for inspection. Continue with the rest of the frontier.
3. Report escalated tickets to the user at the end; they also appear in the board's "Attend un humain" column, where the user can answer.
