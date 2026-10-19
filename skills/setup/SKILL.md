---
name: setup
description: "Installe et adapte les skills de Matt Pocock dans le repo courant (neuf ou avec ses propres skills), puis propose nettoyage, hooks, rules, worktrees et suivi."
disable-model-invocation: true
argument-hint: "[chemin du repo, par défaut le projet courant]"
---

# Setup Matt pour ce repo

Tu installes les skills de Matt Pocock **dans le repo**, versionnés sous `.claude/skills/`, puis tu les adaptes aux conventions du repo. Toute l'équipe les reçoit par Git.

Helper, en lecture seule sans `--apply` :

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/matt-setup.mjs" <commande> --repo "<repo>"
```

| Commande | Effet |
|---|---|
| `inventory` | composants du repo, conflits de nom, stack, tracker, skills Matt déjà installés |
| `install [--skills socle,implement-spec,…]` | copie les skills choisis et ceux qu'ils appellent ; défaut `socle` ; jamais d'écrasement |
| `status` | skills intacts ou adaptés, appels cassés, mises à jour disponibles |
| `upgrade [--apply]` / `upgrade --accept <nom>` | remplace les skills intacts ; valide la fusion d'un skill adapté |
| `retire --path <chemin> --confirm <même chemin> [--apply]` | archive un skill, agent, commande ou rule dans `.claude/skills-archive/` |
| `install-panel [--apply]` | installe les agents du panel (contradicteurs, sécurité, UI, approbateur, chercheur interne) et les branche dans les skills de Matt |
| `install-templates --files board,on-edit,use-cli [--apply]` | copie le tableau de bord et les hooks dans le repo, suivis par le lock ; jamais d'écrasement |

Règle constante : **proposer, montrer, puis appliquer seulement ce que l'utilisateur accepte**, une étape à la fois. Ne jamais committer, publier de ticket ni modifier `~/.claude` sans accord explicite.

## 1. Inventaire

Lance `inventory`, puis lis réellement chaque fichier listé : CLAUDE.md/AGENTS.md, skills, agents, commandes, rules, hooks. Le nom d'un fichier ne suffit pas à juger son rôle.

Résume : repo neuf ou existant, tracker probable (remote, MCP Atlassian, `.scratch/`), stack et commandes de validation, composants existants. Signale `personalSkillsShadowingMatt` (un skill personnel masque celui du projet) et `globalMattKit` (l'ancien kit global fait doublon : l'utilisateur le désinstalle lui-même). Si `matt` n'est pas nul, va à « Mise à jour ».

Ne lis les fichiers de `references/` qu'à l'étape qui les cite.

### Repo vide : chemin rapide

Si `inventory` indique `empty: true` (ou un repo sans code ni composant Claude), ne lis aucune référence et ne lance pas le recommandeur. Si `git.isRepo` est faux, propose `git init -b main` dans le même message. Pose en **un seul message** :
1. l'idée du projet en une phrase, et s'il est gros ou encore flou ;
2. le tracker : local `.scratch/` (recommandé sans remote), Jira (clé du projet) ou GitHub ;
3. front, back, données sensibles ou interface d'administration ?

Puis, après la réponse : `install --skills socle` (+ `wayfinder,implement-spec` si gros ou flou), `install-panel` si la réponse 3 le justifie, configuration Matt (étape 3, sans adaptation), et fin (étape 6). Rappelle de relancer le setup une fois le projet créé : hooks, permissions et rules dépendent de la vraie stack.

## 2. Proposition

Lis [references/skills.md](references/skills.md) : rôle, profil, mode et dépendances de chaque skill.

**Skills de Matt** : le `socle` (15 skills : idée → spec → tickets → code → revue, bugs, retours d'expérience), plus les `optionnels` que le repo justifie (`implement-spec` pour de gros chantiers en parallèle, `triage` si des issues arrivent de l'extérieur, `wayfinder` pour un projet encore flou…). Les `rares` seulement sur demande.

**Composants existants** : une ligne par composant, avec la preuve tirée de sa lecture.

| Composant | Rôle constaté | Proposition | Skill Matt concerné |
|---|---|---|---|
| `.claude/skills/spec-jira` | specs au format maison + epic Jira | intégrer dans `to-spec`, puis archiver | to-spec |

- **garder** : spécialiste sans équivalent (Langfuse, déploiement, domaine métier) ;
- **brancher** : le garder et l'appeler depuis un skill Matt à l'étape où il sert (ex. `diagnosing-bugs` utilise `langfuse-trace` pour un bug LLM), ou l'ajouter au champ `skills:` d'un agent ;
- **intégrer** : ses conventions vont dans la copie Matt, puis il est archivé ;
- **archiver** : doublon ou plus utilisé. Un nom proche ne prouve pas un doublon.

**Panel de spécialistes** : pour un projet avec front et back, données sensibles ou interface d'administration, propose-le en lisant [references/panel.md](references/panel.md), avec `wayfinder` et `implement-spec` si le projet est gros ou flou. Donne l'ordre de grandeur du coût.

Un conflit de nom (`conflicts` dans `install`) se résout avant l'installation : comparer, puis intégrer ou renommer avec l'accord de l'utilisateur. Après accord, `install --skills … --apply`, puis `install-panel --apply` si le panel est retenu.

## 3. Configuration et adaptation

Lis `.claude/skills/setup-matt-pocock-skills/SKILL.md` et suis son processus : il écrit `docs/agents/*.md` et un bloc `## Agent skills` dans le CLAUDE.md ou AGENTS.md existant. Pour Jira ou un autre tracker, choisir « Other » et décrire le vrai fonctionnement à partir des outils du MCP disponible. Ne crée aucun ticket de test.

Puis lis [references/adaptation.md](references/adaptation.md) et modifie directement les copies sous `.claude/skills/<nom>/`, seulement là où une convention du repo l'exige. Montre `git diff` de chaque skill adapté et un exemple de livrable au format du repo.

## 4. Nettoyage

Pour chaque élément à archiver, lance d'abord `retire --path <chemin> --confirm <chemin>` sans `--apply` : s'il signale `mentionedBy`, d'autres skills l'appellent encore, corrige-les ou renonce. Obtiens ensuite l'accord sur son **chemin exact**, puis relance avec `--apply`. Propose aussi de retirer de CLAUDE.md ce qui fait doublon avec `docs/agents/`. Les composants globaux, gérés ou issus de plugins sont seulement signalés.

## 5. Optimisations

Lis [references/optimisations.md](references/optimisations.md) et propose seulement ce que l'inventaire justifie, en commençant toujours par la mémoire partagée (`.scratch/` et `.claude/` versionnés, règle « Mémoire partagée » dans CLAUDE.md) : permissions, hooks (formatage, bons outils), rules, worktrees, la seconde opinion du recommandeur officiel, et pour le tracker local le cycle de vie des tickets, le tableau de bord et la reprise au démarrage. Fusionne sans supprimer l'existant, ni dupliquer un hook déjà présent. Modifier ou remplacer un de ses composants (hook, agent, skill gardé) est une proposition à part, qui le nomme et montre le diff : un accord global sur « les optimisations » ne la couvre pas.

## 6. Fin

Vérifie que `status` ne signale aucun `brokenCalls`. Récapitule ce qui a été installé, adapté, branché, archivé et optimisé, et ce qui reste à faire par l'utilisateur. Propose un commit unique (`chore: setup Matt skills`) sans le faire avant son oui. Rappelle que `/ask-matt` oriente vers le bon skill. Si le repo était vide, rappelle de relancer `/matt-setup:setup` une fois le projet créé (package.json ou pyproject.toml présent) : les hooks, permissions et rules dépendent de la stack réelle.

## Mise à jour d'un repo déjà installé

`upgrade` (aperçu) liste aussi dans `added` ce que la nouvelle version du panel apporte (nouvel agent, règle), installé avec `upgrade --apply` sans rien écraser. `status` montre `upgrade.replace` et `upgrade.scripts` (skills et scripts intacts, remplacés par `upgrade --apply`), `upgrade.merge` (skills adaptés) et `upgrade.scriptsToReview` (scripts modifiés dans le repo : montrer la différence avec `${CLAUDE_PLUGIN_ROOT}/templates/`). Pour chacun de ces derniers, compare la nouvelle version dans `${CLAUDE_PLUGIN_ROOT}/vendor/skills/` avec la copie du repo, reporte les changements de Matt sans perdre les adaptations, montre le diff, puis `upgrade --accept <nom>`.
