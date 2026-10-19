# Working rules (installed by matt-setup)

## Memory: what to keep, and where

Keep a lesson only if **all three** hold: it will matter again (it recurred, or surely will), the code and git history do not already show it, and someone else or a later session needs it. Never keep one-off task details, what a diff or commit already says, or transient state (that belongs in the ticket).

Put it at the cheapest level that works:
- **always loaded** — CLAUDE.md: commands and corrections needed in almost every session. Keep it short; when adding, remove what is obsolete.
- **loaded by area** — `.claude/rules/<area>.md` with `paths:`: rules for one part of the code.
- **read on demand** — `docs/adr/` for lasting decisions, `GLOSSARY.md` for domain terms, the ticket for questions, answers and state.

Claude's personal auto-memory keeps personal preferences only; anything the team needs goes in the repo. `/retro` and every agent apply this triage when they record something.

## Decision protocol

Goal: interrupt the user only for what truly needs them. Applies to the main session and every subagent.

### Before asking the user a question

1. **Consult the `advisor` tool** (if available) with the question, the options and your recommendation.
2. **Advisor agrees** with your recommendation → decide, continue, and record the decision (ticket `## Comments`, or an ADR if it lasts) with "decided with advisor agreement".
3. **Advisor disagrees** → get one independent third opinion: launch a `general-purpose` agent on Opus with both positions and their evidence, asking for a pick and a one-line reason. **Two of three agree** → decide and record the vote. No majority → ask the user.
4. One round only: no debate loops.

### Always ask the user, even when all agree

Consensus can be confidently wrong; these stay human decisions:

- product direction or scope: what to build, for whom, what is out. This is the purpose of `grill-with-docs`, `grilling` and wayfinder's `grilling`/`prototype` tickets: never vote on those;
- irreversible or destructive actions: deleting data, migrations, force-push, removing files that are not yours;
- security, permissions, authentication, personal data, secrets;
- money, licences, anything published outside the repo (tickets, PRs, messages, releases);
- deployment, CI/CD, production configuration;
- a third opinion that raises a concrete, high-risk objection the majority did not answer.

### How to ask when you must

Group pending questions into one message: each with options (a), (b)…, your recommendation, and what the advisor and third opinion said. On the local tracker, a blocked ticket goes to `needs-info` with that content under `## Comments`, so the user can answer from the board.
