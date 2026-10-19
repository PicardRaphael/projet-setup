## Ticket lifecycle

Keep each ticket's `**Status:**` line current so the board and the next session know where work stands:

- Before starting work on a ticket: read its `## Comments` first (a human answer may be there), then set `**Status:** in-progress`.
- When only a person can answer a question or make a decision: `**Status:** needs-info`, write the question under `## Comments` with one option per line (`- (a) …`, `- (b) …`) and your recommendation, then stop work on that ticket.
- When the remaining work must be done by a person (credentials, manual deploy, external approval): `**Status:** ready-for-human`, with what is needed under `## Comments`.
- When the work is merged and verified: `**Status:** done`, with the commit or branch under `## Comments`.

A person may answer from the board (`node .claude/matt/board.mjs --serve`): the answer is appended under `## Comments` as « réponse humaine » and the ticket goes back to `ready-for-agent`. Treat that answer as the decision and continue.
