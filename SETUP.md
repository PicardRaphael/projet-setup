# Installation et mises à jour

## Prérequis

- Claude Code récent et Node.js 20 ou plus.
- Git dans les repos à équiper (un repo vide fonctionne).
- Pour maintenir le plugin (mises à jour de Matt) : un clone de ce dépôt et, à côté, un clone de Matt :

```
dossier/
├── projet-setup/        ce plugin (https://github.com/PicardRaphael/projet-setup)
└── mattpocock-skills/   clone de https://github.com/mattpocock/skills
```

## Installer le plugin (une fois par machine)

Depuis GitHub, pour tout le monde :

```bash
claude plugin marketplace add PicardRaphael/projet-setup
```

```bash
claude plugin install matt-setup@matt-setup-local
```

Pour développer le plugin, installer plutôt depuis son clone local : `claude plugin marketplace add <chemin du clone>`. Les modifications sont alors lues directement, sans réinstallation.

Ouvre ensuite une nouvelle session dans un repo et lance `/matt-setup:setup`.

Le setup utilise aussi le plugin officiel `claude-code-setup` (recommandations de serveurs MCP, plugins et agents) : s'il manque, il propose de l'installer et le fait lui-même sur ton accord. Pour l'installer d'avance :

```bash
claude plugin install claude-code-setup@claude-plugins-official
```

## Mettre à jour quand Matt publie une nouvelle version

Depuis `matt-setup/` :

1. Récupérer la nouvelle version de Matt :

   ```bash
   git -C ../mattpocock-skills pull
   ```

2. Voir ce qui change (skills ajoutés, retirés, modifiés), sans rien écrire :

   ```bash
   node scripts/sync-upstream.mjs --from ../mattpocock-skills
   ```

3. Appliquer : `vendor/` est remplacé et la version du plugin augmente (1.0.0 → 1.0.1).

   ```bash
   node scripts/sync-upstream.mjs --from ../mattpocock-skills --apply
   ```

   Si Matt a ajouté un skill, le rapport le liste dans `toClassify` : le ranger dans un profil (`PROFILES` de `scripts/matt-setup.mjs`) et, s'il appelle d'autres skills, l'ajouter à `DEPENDENCIES`. Les tests échouent tant que ce n'est pas fait.

4. Vérifier :

   ```bash
   node --test "tests/*.test.mjs"
   ```

5. Rien à réinstaller : le plugin est lu directement depuis ce dossier. Ouvre une nouvelle session (ou tape `/reload-plugins`) pour charger la nouvelle version.

6. Dans chaque repo équipé, relancer `/matt-setup:setup`. Il détecte la mise à jour :
   - les skills que tu n'as pas modifiés sont remplacés ;
   - pour chaque skill adapté, Claude reporte les changements de Matt dans ta version, te montre le diff, puis valide la fusion. Tes adaptations ne sont jamais écrasées.

## Mettre à jour le plugin lui-même

Après une modification de `matt-setup/` (scripts, skill, templates) : lancer les tests et augmenter `version` dans `.claude-plugin/plugin.json`. La modification s'applique à la session suivante ou après `/reload-plugins`.

## Désinstaller

```bash
claude plugin uninstall matt-setup@matt-setup-local
```

Les repos équipés gardent leurs skills : ils sont versionnés dans chaque repo et ne dépendent pas du plugin.

## Problèmes courants

| Symptôme | Cause et solution |
|---|---|
| Un skill du repo ne semble pas pris en compte | Un skill personnel de même nom dans `~/.claude/skills/` passe avant celui du projet. Le setup le signale (`personalSkillsShadowingMatt`) : renommer ou retirer le skill personnel. |
| `/matt-setup:setup` introuvable | Nouvelle session ou `/reload-plugins` après l'installation ; vérifier avec `claude plugin list`. |
| Les autorisations du repo sont ignorées (« workspace has not been trusted ») | Ouvrir Claude Code une fois en mode interactif dans le repo et accepter le dialogue de confiance. |
| Le tableau de bord ne bouge pas | Le cycle de vie des tickets n'est pas dans `docs/agents/issue-tracker.md` : relancer le setup, étape Optimisations. |
| Un hook bloque une commande légitime | Ajuster les arguments de `.claude/hooks/use-cli.mjs` dans `.claude/settings.json`. |

## Contenu du dossier

| Chemin | Rôle |
|---|---|
| `skills/setup/` | le skill `/matt-setup:setup` et ses références (adaptation, optimisations) |
| `scripts/matt-setup.mjs` | `inventory`, `install`, `status`, `upgrade`, `retire`, `install-templates` (rien n'est écrit sans `--apply`) |
| `scripts/sync-upstream.mjs` | mise à jour du snapshot de Matt |
| `templates/` | `board.mjs`, `hooks/on-edit.mjs`, `hooks/use-cli.mjs`, `ticket-lifecycle.md`, copiés dans les repos à la demande |
| `vendor/` | snapshot des skills de Matt, voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |
| `tests/` | `node --test "tests/*.test.mjs"` |
