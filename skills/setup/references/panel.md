# Panel de spécialistes

Ajoute aux skills de Matt des agents qui contredisent le plan et relisent sous des angles que les deux axes de `code-review` ne couvrent pas. Inspiré des relecteurs parallèles et de l'approbateur de la factory de ZazenCodes, réécrit (sa factory n'a pas de licence).

| Agent | Modèle | Appelé par | Rôle |
|---|---|---|---|
| `plan-challenger` | opus | `to-spec`, `wayfinder` | trois instances en parallèle (produit, technique, simplicité) contredisent le plan avant publication |
| `internal-researcher` | sonnet | `wayfinder` | faits sur les systèmes existants de l'organisation : autres repos, bases de connaissances, endpoints |
| `security-reviewer` | opus | `code-review` | si le diff touche auth, routes, données, secrets, dépendances |
| `ui-reviewer` | sonnet | `code-review` | si le diff touche le front ; regarde l'application si un serveur de dev tourne et qu'un navigateur est disponible, sinon relit le code |
| `security-reviewer`, `ui-reviewer` | | `diagnosing-bugs` | le correctif d'un bug passe par `code-review` avant d'être déclaré terminé |
| `approver` | opus | `implement-spec` | avant chaque fusion : APPROVE, REWORK (2 fois au plus) ou ESCALATE vers « Attend un humain » |

Aucun n'a d'outil d'édition (`disallowedTools: Edit, Write, NotebookEdit`) ; Bash reste disponible pour git. Ils héritent des outils MCP de la session (navigateur, base de connaissances). Leur première ligne est un verdict lisible par la machine.

## Quand le proposer

- Projet avec front et back, données sensibles, droits d'accès ou interface d'administration : proposer le panel complet.
- Petit outil, bibliothèque, script : ne pas le proposer ; les deux axes de `code-review` suffisent.
- Le panel ne branche que les skills installés : installer `wayfinder` et `implement-spec` (optionnels) si le projet est gros ou encore flou.

## Installation

1. `install-panel` (aperçu), puis `install-panel --apply` : copie les agents dans `.claude/agents/` (suivis par le lock) et ajoute un bloc balisé à la fin de `to-spec`, `wayfinder`, `code-review`, `implement-spec` et `diagnosing-bugs`. Ces skills restent « intacts » pour les mises à jour : le bloc est remis automatiquement après chaque `upgrade`.
2. Un agent du repo qui porte déjà le même nom est gardé : vérifier qu'il rend la même ligne de verdict, sinon le renommer ou adapter le bloc.
3. Si `internal-researcher` est installé, écrire `docs/agents/internal-sources.md` avec l'utilisateur : chemins des autres repos à consulter, serveurs MCP de connaissance disponibles dans la session (noms réels), espaces de documentation. Exemple :

   ```markdown
   # Sources internes
   - Repos : ../api (endpoints REST, dossier src/routes), ../database (fonctions SQL)
   - Base de connaissances : serveur MCP <nom réel> (ses outils de recherche puis de lecture)
   - Ne jamais appeler d'endpoint en écriture pendant une recherche.
   ```

   Les repos cités doivent être lisibles par la session : dans l'app, les ajouter comme dossiers de la session ; en CLI, `--add-dir`.
4. `ui-reviewer` voit l'application si un serveur de dev tourne pour le worktree et qu'un outil navigateur est disponible ; sinon il relit le code et le dit.

## Coût

Par ticket avec `implement-spec` : les deux axes de Matt, plus la sécurité et l'UI seulement quand le diff les concerne, plus l'approbateur. Par spec : trois contradicteurs, une fois. Le donner en ordre de grandeur à l'utilisateur et proposer de sauter le panel pour une petite spec.
