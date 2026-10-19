# Skills de Matt : référence compacte

auto = Claude le déclenche ou un autre skill l'appelle (sa description coûte du contexte à chaque session) ; / = lancé par l'utilisateur.

| Skill | Profil | Mode | Rôle | Appelle |
|---|---|---|---|---|
| ask-matt | socle | / | routeur : indique le bon skill ou chemin |  |
| setup-matt-pocock-skills | socle | / | écrit docs/agents/*.md et le bloc ## Agent skills |  |
| grill-with-docs | socle | / | interview + GLOSSARY.md et ADR | grilling, domain-modeling |
| grilling | socle | auto | l'interview elle-même |  |
| domain-modeling | socle | auto | glossaire et ADR |  |
| to-spec | socle | / | spec publiée dans le tracker |  |
| to-tickets | socle | / | tickets tranches verticales avec dépendances |  |
| implement | socle | / | un ticket : TDD, tests, revue, commit | tdd, code-review |
| tdd | socle | auto | rouge → vert → refactor | codebase-design |
| code-review | socle | auto | revue normes + spec, deux sous-agents |  |
| codebase-design | socle | auto | modules profonds, interfaces |  |
| pr | socle | auto | description de PR |  |
| diagnosing-bugs | socle | auto | bug difficile ou lenteur |  |
| retro | socle | / | leçons de fin de session | writing-for-agents |
| writing-for-agents | socle | auto | style des skills et CLAUDE.md |  |
| implement-spec | optionnels | / | toute une spec en parallèle (worktrees) | tdd, code-review |
| triage | optionnels | / | issues venant de l'extérieur | grilling, domain-modeling |
| wayfinder | optionnels | / | très gros chantier encore flou | research, prototype, grilling, domain-modeling |
| research | optionnels | auto | faits sur sources primaires |  |
| prototype | optionnels | auto | prototype jetable |  |
| handoff | optionnels | / | passation entre sessions |  |
| improve-codebase-architecture | optionnels | / | code difficile à faire évoluer | codebase-design, grilling, domain-modeling |
| wizard | optionnels | auto | étapes que seul un humain peut faire |  |
| grill-me | rares | / | interview sans docs (grill-with-docs fait mieux) | grilling |
| to-questionnaire | rares | / | questionnaire pour un tiers |  |
| wait-what | rares | / | réexpliquer simplement |  |
| teach | rares | / | apprentissage, hors code |  |

Chemin principal : grill-with-docs → to-spec → to-tickets → implement (ou implement-spec) → retro. Un petit bug : implement ou diagnosing-bugs.
