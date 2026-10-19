## Challenge panel (repo convention)

Before publishing the spec, run the challenge panel: launch the `plan-challenger` agent three times **in parallel, in one message, in the foreground** (wait for all three reports before continuing), with the angles `product`, `technical` and `simplicity`, each given the draft spec and pointers to GLOSSARY.md, the ADRs and the conventions. Then:

1. Fix the draft for every objection backed by evidence.
2. Settle the remaining objections with the decision protocol (`.claude/rules/matt-decisions.md`): advisor, then a third opinion if needed; the majority wins and is noted in the spec. Bring to the user, grouped in one message with options and recommendation, only what the protocol reserves for humans (product direction and scope, security, irreversible, money, publication) or what has no majority.
3. Publish only after the user has settled them. Record decisions with lasting impact as ADRs.

If the spec is small (one or two tickets), ask the user whether to skip the panel.
