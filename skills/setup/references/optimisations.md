# Optimisations proposables

Proposer seulement ce que l'inventaire justifie, chacune avec son effet et son coût. Fusionner dans `.claude/settings.json` (partagé) ou `.claude/settings.local.json` (personnel) sans retirer l'existant. En cas de doute sur une syntaxe, vérifier la documentation actuelle (code.claude.com/docs : hooks, permissions, memory, worktrees).

## Permissions (coût nul)

Si des secrets existent, interdire leur lecture ; une règle `Read` deny bloque aussi leur édition. Pour protéger un fichier sans masquer sa lecture (lockfile, fichiers générés, migrations appliquées), utiliser `Edit(...)` :

```json
{ "permissions": {
  "deny": ["Read(./.env)", "Read(./.env.*)", "Edit(./package-lock.json)", "Edit(./migrations/applied/**)"],
  "allow": ["Bash(npm test:*)", "Bash(npm run typecheck:*)"]
} }
```

`allow` : seulement les commandes de validation déjà identifiées, pour éviter les demandes répétées.

## Hook de formatage (si un formateur est configuré)

`PostToolUse`, matcher `Edit|Write`. Installer avec `install-templates --files on-edit --apply` (copie dans `.claude/hooks/`, suivie par le lock pour les mises à jour) : il lance la commande donnée sur le fichier édité (Windows compris) et ne bloque jamais. Toujours mettre `--ext=` avec les extensions que l'outil traite : sans lui, un processus est lancé à chaque édition, même d'un fichier non concerné. Plusieurs outils sur les mêmes fichiers (Prettier puis ESLint) : un seul hook avec une commande qui enchaîne, plutôt que deux hooks. JS : `npx prettier --write --ignore-unknown` (ou `pnpm exec`, `biome format --write`). Python avec ruff : `--ext=.py,.pyi uv run ruff format` (ou `ruff format` hors uv).

```json
{ "hooks": { "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/on-edit.mjs\" --ext=.ts,.tsx,.js,.jsx,.json,.css,.md npx prettier --write" }] }] } }
```

## Hook « bons outils » (si le repo impose un outil)

Pratique recommandée par Matt : une règle d'outillage (« pnpm, jamais npm », « uv, pas pip ») tient mieux dans un hook déterministe que dans CLAUDE.md, et ne coûte aucun contexte. `PreToolUse`, matcher `Bash|PowerShell` (sous Windows, Claude utilise aussi l'outil PowerShell), avec `use-cli.mjs` installé par `install-templates --files use-cli --apply` : il refuse la commande et dit quoi utiliser. Proposer seulement quand l'inventaire montre un choix net, puis retirer de CLAUDE.md la consigne équivalente.

Paires selon `stack` :

| Repo | Arguments de `use-cli.mjs` |
|---|---|
| JS, `packageManager: pnpm` | `npm=pnpm npx="pnpm dlx" yarn=pnpm` |
| JS, `packageManager: yarn` / `bun` | `npm=yarn npx="yarn dlx"` / `npm=bun npx=bunx` |
| Python, `python.manager: uv` | `pip="uv add (ou uv pip)" pip3="uv add (ou uv pip)" poetry=uv python="uv run python" python3="uv run python" pytest="uv run pytest"` |
| Python, `python.manager: poetry` | `pip="poetry add" pip3="poetry add"` |

Avec uv, bloquer `python` et `pytest` nus évite les tests lancés hors de l'environnement du projet ; ne les ajouter que si l'utilisateur le veut, `pip` seul est le minimum.

```json
{ "hooks": { "PreToolUse": [{ "matcher": "Bash|PowerShell", "hooks": [{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/use-cli.mjs\" pip=\"uv add (ou uv pip)\" pytest=\"uv run pytest\"" }] }] } }
```

Les commandes proposées ailleurs suivent le même gestionnaire : `Bash(uv run pytest:*)` dans `allow`, `uv run ruff format` pour le formatage, `uv sync` dans la section « Checkout neuf ».

Pas de tests ou typecheck au `Stop` : `implement` les lance déjà, et un `Stop` lent ralentit chaque réponse.

## Rules (`.claude/rules/*.md`)

Pour sortir de CLAUDE.md ce qui ne concerne qu'une partie du code. Une rule avec `paths:` ne se charge que lorsque Claude touche ces fichiers :

```markdown
---
paths: ["src/api/**/*.ts"]
---
Toute route valide son entrée avec le schéma Zod du module.
```

Proposer une rule quand CLAUDE.md contient des consignes propres à un dossier, ou quand un ancien skill archivé portait ce type de règle.

## Worktrees (si `implement-spec` est installé)

- `.gitignore` : ajouter `.claude/worktrees/` (`inventory` indique `worktreesIgnored`).
- `.worktreeinclude` (syntaxe gitignore) : fichiers ignorés à copier dans chaque nouveau worktree, typiquement `.env.local`. Seulement ceux que l'utilisateur choisit.
- Section courte « Checkout neuf » dans CLAUDE.md ou AGENTS.md : installation des dépendances, génération éventuelle, et un port par ticket si plusieurs serveurs tournent en parallèle (port de base + 10 × numéro du ticket). Chaque sous-agent d'implement-spec la suit dans son worktree.

## Suivi visuel et reprise (tracker local `.scratch/` seulement)

Avec Jira ou GitHub, le tracker est déjà le tableau de bord : ne rien installer.

Avec le tracker local, trois éléments vont ensemble :

1. **Cycle de vie des tickets.** Les skills de Matt créent les tickets (`**Status:** ready-for-agent`) mais ne mettent pas leur statut à jour. Ajouter à `docs/agents/issue-tracker.md` le bloc de `${CLAUDE_PLUGIN_ROOT}/templates/ticket-lifecycle.md` : tous les skills lisent ce fichier, donc `implement` et `implement-spec` marquent `in-progress`, `needs-info` (question à une personne) et `done`.
2. **Tableau de bord.** `install-templates --files board --apply` copie `.claude/matt/board.mjs` (sans dépendance). `node .claude/matt/board.mjs --serve` ouvre http://127.0.0.1:4545 : colonnes Attend un humain / Prêts / En cours / Bloqués / Terminés par chantier, ticket mis en forme au clic, et formulaire de réponse pour les tickets qui attendent une personne (la réponse est écrite dans le ticket, qui repasse en `ready-for-agent`). Seul `127.0.0.1` est servi, protégé par un jeton. Sans option : vue texte.
3. **Reprise au démarrage.** Hook `SessionStart` : `node "$CLAUDE_PROJECT_DIR/.claude/matt/board.mjs" --brief`. Sa sortie entre dans le contexte : d'abord les tickets qui attendent une personne, puis ceux en cours ou prêts. Rien n'est affiché sans travail ouvert.

```json
{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/.claude/matt/board.mjs\" --brief" }] }] } }
```

## Mémoire partagée avec l'équipe (toujours vérifier)

La mémoire automatique de Claude (`~/.claude/projects/…`) et les documents de `/handoff` restent sur la machine de chacun. Ce qui doit servir à toute l'équipe vit dans le repo et passe par Git.

- `inventory` signale `scratchIgnored` et `claudeIgnored`. Si `.scratch/` ou `.claude/skills/` est ignoré par Git alors que l'équipe doit partager tickets, réponses et skills : proposer de retirer la règle du `.gitignore` (seulement `.claude/settings.local.json` et `.claude/worktrees/` restent personnels).
- Installer la rule `install-templates --files decisions --apply` (`.claude/rules/matt-decisions.md`, versionnée, chargée à chaque session) : elle dit où ranger la mémoire d'équipe et comment décider sans interrompre l'utilisateur. **Ne rien ajouter à CLAUDE.md ni AGENTS.md pour ça** : ils restent courts (commandes, corrections d'erreurs récurrentes), comme le recommande l'équipe de Claude Code.
- `/retro` (socle) met à jour les instructions du repo en fin de session : le rappeler à l'utilisateur comme moyen de capitaliser pour l'équipe.
- Si un agent du repo utilise le champ `memory:`, préférer la portée projet, versionnée, à la portée utilisateur quand ce qu'il retient doit être partagé (vérifier la syntaxe dans la documentation des sous-agents).

## Seconde opinion : serveurs MCP, plugins, agents spécialisés

Seulement si le repo contient du code (une stack détectée) ; jamais sur un repo vide. Après ta propre analyse, obtiens l'avis du recommandeur officiel d'Anthropic (plugin `claude-code-setup`, lecture seule) : il propose serveurs MCP, plugins et sous-agents adaptés à la stack (ex. context7 pour la doc des librairies, Playwright pour une app web).

1. Vérifie sa présence : `claude plugin list` contient `claude-code-setup`.
2. Absent : demande une fois « J'installe le plugin officiel claude-code-setup (recommandations d'automatisation, lecture seule) ? », puis sur un oui lance toi-même `claude plugin install claude-code-setup@claude-plugins-official`.
3. Lance l'analyse toi-même, depuis la racine du repo, dans un processus séparé (un plugin installé pendant la session n'y est chargé qu'à la suivante) :

   ```
   claude -p "/claude-code-setup:claude-automation-recommender Réponds en français, 20 lignes maximum." --allowedTools Read Glob Grep "Bash(ls:*)" "Bash(cat:*)" --max-turns 15
   ```

   Si le skill est déjà chargé dans ta session, tu peux aussi l'invoquer directement.
4. Filtre son résultat avec les règles de ce document avant de le présenter, à part de tes propres propositions : rien qui double un hook, un agent ou un skill existant (un agent « vérificateur de spec » double l'axe Spec de `code-review`) ; pas de typecheck ni de tests à chaque édition ; un serveur MCP seulement s'il sert la stack détectée.

Selon `stack.ai` :
- `anthropic` ou `claude-agent-sdk` : le skill intégré `claude-api` de Claude Code couvre modèles, prompt caching, outils et agents ; rien à installer. Une rule à `paths:` sur le code qui appelle l'API peut renvoyer vers lui.
- `langfuse` : chercher un skill ou serveur MCP Langfuse déjà présent dans le repo ou la session avant d'en proposer un.

## À ne pas ajouter par défaut

- Des agents supplémentaires : `code-review` et `implement-spec` lancent déjà leurs sous-agents. Proposer un agent seulement pour réutiliser un spécialiste existant ou restreindre des outils (relecteur en lecture seule).
- Des notifications ou une orchestration permanente.
