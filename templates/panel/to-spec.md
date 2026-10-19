## Challenge panel (repo convention)

Before publishing the spec, run the challenge panel: launch the `plan-challenger` agent three times **in parallel, in one message, in the foreground** (wait for all three reports before continuing), with the angles `product`, `technical` and `simplicity`, each given the draft spec and pointers to GLOSSARY.md, the ADRs and the conventions. Then:

1. Fix the draft for every objection backed by evidence.
2. Bring the remaining objections and every "question for the human" to the user, grouped, one decision at a time, each with options and your recommendation.
3. Publish only after the user has settled them. Record decisions with lasting impact as ADRs.

If the spec is small (one or two tickets), ask the user whether to skip the panel.
