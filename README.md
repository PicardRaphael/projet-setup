# matt-setup

Les skills de Matt Pocock dans tes repos, adaptés à leurs conventions. Une seule commande, `/matt-setup:setup`, marche dans un repo neuf comme dans un repo qui a déjà ses skills, agents et hooks.

Installation et mises à jour : **[SETUP.md](SETUP.md)**.

## 1. Équiper un repo

Dans le repo, lance `/matt-setup:setup`. Claude lit le repo, propose, et n'applique que ce que tu acceptes :

| Étape | Ce qui se passe |
|---|---|
| 1. Inventaire | Lecture de CLAUDE.md, skills, agents, rules, hooks, stack (gestionnaire npm/pnpm/uv/poetry, outils de test, SDK d'IA) et tracker |
| 2. Proposition | Le socle de 15 skills Matt + les optionnels utiles. Pour chacun de tes composants : **garder**, **brancher** (l'appeler depuis un skill Matt ou un agent), **intégrer** dans un skill Matt, ou **archiver** |
| 3. Configuration et adaptation | La configuration prévue par Matt (`docs/agents/*.md`), puis les skills modifiés selon tes conventions, diff à l'appui |
| 4. Nettoyage | Les éléments acceptés partent dans `.claude/skills-archive/` (réversible) |
| 5. Optimisations | Permissions, hooks (formatage, bons outils), rules, worktrees, serveurs MCP utiles, et pour le tracker local un tableau de bord et la reprise au démarrage |
| 6. Récapitulatif | Puis proposition d'un commit unique |

Les skills sont copiés dans `.claude/skills/` et versionnés : toute l'équipe les reçoit par Git. Relancer `/matt-setup:setup` plus tard fait la mise à jour.

## Les trois parcours

### A. Nouveau projet à partir d'une idée floue (ex. interface admin avec front et back)

1. `mkdir mon-projet`, `git init`, ouvrir Claude Code dedans, `/matt-setup:setup` : socle + `wayfinder` + `implement-spec` + **panel de spécialistes**. Pour un projet qui dépend d'autres systèmes de l'organisation, renseigner `docs/agents/internal-sources.md` (autres repos, base de connaissances).
2. `/wayfinder <ton idée>` : Claude bâtit une carte de questions et les résout avec toi, une par session. Les recherches sur les systèmes existants partent en parallèle vers `internal-researcher` ; les maquettes passent par `prototype`. Avant de conclure, **trois contradicteurs** (produit, technique, simplicité) attaquent les décisions ; chaque objection non résolue devient une nouvelle question.
3. `/to-spec` : nouvelle passe des contradicteurs, tu tranches leurs objections, puis la spec est publiée. `/to-tickets` découpe.
4. Une fois le projet créé (package.json ou pyproject.toml), relancer `/matt-setup:setup` : hooks, permissions et rules adaptés à la vraie stack.
5. `/implement-spec` : un agent par ticket dans son worktree ; revue avec les relecteurs **sécurité** et **UI/UX** quand ils sont concernés ; **approbateur** avant chaque fusion, qui escalade vers toi ce qui est risqué ou non tranché (colonne « Attend un humain », où tu réponds).

### B. Fonctionnalité floue dans un projet existant

`/matt-setup:setup` une fois (il garde et branche tes skills et agents), puis `/grill-with-docs <la fonctionnalité>` si elle tient en une spec, ou `/wayfinder` si elle est grosse. Ensuite comme A : `/to-spec` (contradicteurs), `/to-tickets`, `/implement` ou `/implement-spec`.

### C. Bug dans un projet existant

`diagnosing-bugs` (il se déclenche quand tu décris le bug, ou dis « diagnose ») : reproduire, hypothèses, instrumentation, correctif et test de non-régression. Avec le panel, le correctif passe ensuite par `code-review` et ses relecteurs avant d'être déclaré terminé. Un bug qui révèle un problème de conception mène à `/improve-codebase-architecture`.

### Le panel de spécialistes (option du setup)

| Agent | Quand | Rôle |
|---|---|---|
| `plan-challenger` ×3 | avant de publier une spec ou de clore une carte wayfinder | contredire sous trois angles : produit, technique, simplicité |
| `internal-researcher` | recherches de wayfinder | trouver les vrais endpoints, tables, règles dans les autres repos et bases de connaissances |
| `security-reviewer` | revue d'un diff qui touche auth, API, données, secrets | failles avec preuve et correctif |
| `ui-reviewer` | revue d'un diff front | parcours, états, accessibilité ; regarde l'application si un serveur de dev tourne et qu'un navigateur est disponible, sinon relit le code |
| `approver` | avant chaque fusion d'implement-spec | approuve, demande une reprise (2 fois au plus) ou escalade vers toi |

Modèles : Sonnet 5.5 pour chercher, Opus pour juger (effort high pour la sécurité et l'approbation). **Moins d'interruptions** : avant de te poser une question, un agent consulte le conseiller ; d'accord, il décide et le note ; en désaccord, un troisième avis tranche à la majorité. Tu restes seul juge du périmètre produit, de la sécurité, de l'irréversible, de l'argent et de ce qui est publié. Garde ta session sur Opus (effort medium ou high) et un conseiller (`/advisor fable`). Ils s'ajoutent aux deux revues de Matt (normes et spec) sans les remplacer, ne modifient jamais le code (un hook le garantit) et ne tournent que lorsqu'ils sont concernés. **Chacun a sa mémoire de projet** (`.claude/agent-memory/<agent>/`, versionnée) : il y note en une ligne ce qu'il apprend sur ce repo et la relit au lancement suivant. Une leçon utile aux autres agents (une erreur que les implémenteurs refont) est rangée par l'orchestrateur dans une rule de la zone concernée, que tous les agents reçoivent.

## 2. Travailler avec les skills

En cas de doute, tape `/ask-matt` et décris ta situation : il indique le bon chemin.

Légende : **/** = tu le lances (`/to-spec`) ; **auto** = Claude le déclenche quand la situation s'y prête, ou un autre skill l'appelle.

### Le chemin principal : d'une idée au code livré

```
 idée ──► /grill-with-docs ──► /to-spec ──► /to-tickets ──► /implement       (un ticket)
          interview, glossaire   spec dans   tickets avec      ou /implement-spec (tous, en parallèle)
          et décisions (ADR)     le tracker  dépendances             │
                                                                     ▼
                                    tdd (auto) ──► code-review (auto) ──► pr (auto) ──► /retro
```

1. **`/grill-with-docs`** : Claude t'interroge question par question jusqu'à ce que le besoin soit clair. Il note les termes du métier dans `GLOSSARY.md` et les décisions dans `docs/adr/`.
2. **`/to-spec`** : transforme la discussion en spec, publiée dans ton tracker (Jira, GitHub ou `.scratch/`). Il synthétise, sans nouvelle interview.
3. **`/to-tickets`** : découpe la spec en tickets « tranche verticale » (chacun livre quelque chose de testable de bout en bout), avec les liens « bloqué par ».
4. **`/implement`** : réalise un ticket dans la session : TDD, typecheck, tests, revue, commit.
   **`/implement-spec`** : réalise toute la spec. Un sous-agent par ticket prêt, chacun dans son worktree, fusion sur une branche d'intégration, revue finale, nettoyage.
5. **`/retro`** : en fin de session, tire les leçons et met à jour les instructions du repo.

Un petit bug ou une petite tâche : `/implement` directement, ou `diagnosing-bugs`.

### Les autres entrées

| Situation | Skill |
|---|---|
| Bug difficile, lenteur | `diagnosing-bugs` (auto) : reproduire → hypothèses → instrumenter → corriger → test de non-régression |
| Très gros chantier encore flou | `/wayfinder` : carte de tickets-questions (recherche, prototype, décision) résolus avant la spec |
| Issues venant de l'extérieur | `/triage` : tri, vérification, brief prêt pour un agent |
| Code difficile à faire évoluer | `/improve-codebase-architecture` : rapport des modules à approfondir, puis discussion |
| « Ça ressemblerait à quoi ? » | `prototype` (auto) : prototype jetable pour trancher une question d'état ou d'interface |
| Faits fiables (doc d'API, norme) | `research` (auto) : recherche sur sources primaires, notes dans le repo |
| Étape que seul un humain peut faire | `wizard` (auto) : script interactif pas à pas (secrets CI, console cloud) |
| Changer de session, d'outil ou de collègue | `/handoff` : document de passation |

### Les briques appelées par les autres

| Brique | Rôle | Utilisée par |
|---|---|---|
| `grilling` | l'interview | grill-with-docs, grill-me, triage, wayfinder, improve-codebase-architecture |
| `domain-modeling` | glossaire et ADR | grill-with-docs, triage, wayfinder, improve-codebase-architecture |
| `tdd` | rouge → vert → refactor | implement, implement-spec |
| `codebase-design` | modules profonds et interfaces | tdd, improve-codebase-architecture |
| `code-review` | revue en deux axes : normes du repo et respect de la spec | implement, implement-spec |
| `writing-for-agents` | style des skills, CLAUDE.md, AGENTS.md | retro |
| `pr` | description de PR | à chaque PR |

`/setup-matt-pocock-skills` écrit la configuration que lisent les autres skills (`docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md` et un bloc `## Agent skills` dans CLAUDE.md). `/matt-setup:setup` le lance pour toi.

### Profils

| Profil | Skills | Quand |
|---|---|---|
| **socle** (15) | ask-matt, setup-matt-pocock-skills, grill-with-docs, grilling, domain-modeling, to-spec, to-tickets, implement, tdd, code-review, codebase-design, pr, diagnosing-bugs, retro, writing-for-agents | tous les repos |
| **optionnels** (8) | implement-spec, triage, wayfinder, research, prototype, handoff, improve-codebase-architecture, wizard | selon le repo |
| **rares** (4) | grill-me, to-questionnaire, wait-what, teach | sur demande |

Pas les 27 partout : chaque skill **auto** ajoute sa description au contexte de chaque session, et trop d'entrées brouillent le choix. Les briques nécessaires sont ajoutées automatiquement (choisir `wayfinder` ajoute `research` et `prototype`).

## 3. Suivre et reprendre le travail (tracker local)

Avec Jira ou GitHub, le tracker est le tableau de bord. Avec le tracker local (`.scratch/`), le setup propose :

- **le tableau de bord** : `node .claude/matt/board.mjs --serve`, puis http://127.0.0.1:4545. Colonnes **Attend un humain** / Prêts / En cours / Bloqués / Terminés par chantier, rafraîchi toutes les 3 s. Un clic ouvre le ticket mis en forme dans un panneau latéral ; pour un ticket qui attend une réponse, tu réponds directement dans le panneau : ta réponse est écrite dans le ticket, qui repasse en Prêt, et la prochaine session Claude la reprend. Pas besoin de retrouver la bonne session. `node .claude/matt/board.mjs` donne la même vue en texte ;
- **la reprise au démarrage** : à l'ouverture d'une session, Claude reçoit les questions en attente puis les tickets en cours ou prêts ;
- **le cycle de vie des tickets** dans `docs/agents/issue-tracker.md` : `in-progress`, `needs-info` (question posée à une personne), `ready-for-human`, `done`.

## 4. Où se trouve quoi dans un repo équipé

| Chose | Emplacement |
|---|---|
| Skills (versionnés, adaptés au repo) | `.claude/skills/<nom>/` |
| Version d'origine et état des adaptations | `.claude/matt-skills.lock.json` |
| Configuration Matt | `docs/agents/*.md`, bloc `## Agent skills` de CLAUDE.md |
| Glossaire et décisions | `GLOSSARY.md`, `docs/adr/` |
| Specs et tickets (tracker local) | `.scratch/<chantier>/spec.md`, `.scratch/<chantier>/issues/NN-*.md` |
| Hooks et tableau de bord | `.claude/settings.json`, `.claude/hooks/`, `.claude/matt/board.mjs` |
| Anciens skills archivés | `.claude/skills-archive/` |

### Ce qui est partagé avec l'équipe

Tout ce qui est dans le repo passe par Git : skills, CLAUDE.md, rules, hooks, `docs/agents/`, glossaire, ADR, et les tickets de `.scratch/` (le setup vérifie qu'ils ne sont pas ignorés par Git). La mémoire automatique de Claude et les documents `/handoff` restent personnels : la rule `.claude/rules/matt-decisions.md` envoie vers le repo tout ce qui doit servir aux autres, sans alourdir CLAUDE.md, et `/retro` capitalise en fin de session.

## 5. Ce qui est garanti par du code, et ce qui dépend de Claude

| Code (déterministe, testé) | Claude, avec ton accord |
|---|---|
| Inventaire, copie avec dépendances, détection intact / adapté / mise à jour | Jugement de tes composants et choix des adaptations |
| Archivage sans écrasement, refus d'archiver un skill encore appelé | Texte des adaptations |
| Hooks : formatage, refus des mauvais outils, reprise au démarrage | Choix des optimisations |
| Tableau de bord calculé depuis `.scratch/` | Mise à jour du statut des tickets, selon le cycle de vie |

## 6. Pour aller plus loin : les vidéos de Matt

| Sujet | Vidéo |
|---|---|
| Le flux complet, de l'installation à l'implémentation | [mattpocock/skills, de bout en bout](https://www.youtube.com/watch?v=M6mYodf0dJM) |
| Pourquoi `/grill-with-docs` plutôt que `/grill-me` | [J'ai arrêté /grill-me pour coder](https://www.youtube.com/watch?v=6BB6exR8Zd8) |
| Bien mener une interview | [9 erreurs avec /grill-*](https://www.youtube.com/watch?v=UzMNBN6xLLA) |
| Prototyper plutôt que tout spécifier | [Prototypez plutôt](https://www.youtube.com/watch?v=n0VhIVtviC0) |
| Planifier un très gros chantier | [/wayfinder](https://www.youtube.com/watch?v=F3lL98Pj90o) |
| Passer le relais entre sessions | [/handoff](https://www.youtube.com/watch?v=dtAJ2dOd3ko) |
| `/implement-spec`, `/pr`, `/retro` | [Skills v1.3](https://www.youtube.com/watch?v=BsJGo1wFTvQ) |
| Tri des issues | [/triage](https://www.youtube.com/watch?v=MzWIIlx0Gpc) |
| CLAUDE.md court plutôt que généré | [Ne lancez jamais /init](https://www.youtube.com/watch?v=9tmsq-Gvx6g) |
| Imposer les bons outils par hook | [Forcer la bonne CLI](https://www.youtube.com/watch?v=3CSi8QAoN-s) |
| Code en modules profonds | [Votre codebase n'est pas prête pour l'IA](https://www.youtube.com/watch?v=uC44zFz7JSM) |

**Travail sans surveillance.** [Sandcastle](https://github.com/mattpocock/sandcastle) (Matt, MIT) lance des agents Claude Code en parallèle dans des conteneurs Docker, Podman ou Vercel, puis fusionne leurs commits : l'équivalent de la factory de Zazen. Non installé par le setup (Docker et un script par repo) ; à envisager quand `/implement-spec` ne suffit plus.
