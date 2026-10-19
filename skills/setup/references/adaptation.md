# Adapter les copies de Matt

But : que chaque skill produise des livrables conformes au repo, sans perdre la méthode de Matt.

## Ordre de préférence

1. **`docs/agents/*.md` et le bloc `## Agent skills`** : tracker, labels, docs de domaine. Les skills de Matt les lisent déjà. Aucune modification de skill nécessaire.
2. **Instructions du repo** (CLAUDE.md, rules) : conventions générales de code, langue, commandes de validation. Elles s'appliquent à tous les skills.
3. **Texte d'un skill** : seulement quand une convention touche une étape précise de ce skill et que 1 et 2 ne suffisent pas.

CLAUDE.md et AGENTS.md restent courts : Matt déconseille les fichiers générés et exhaustifs, qui coûtent du contexte à chaque session et dégradent les réponses. N'y mettre que ce qui vaut partout et que le code ne montre pas ; le reste va dans `docs/agents/`, une rule à `paths:` ou un hook.

## Ce qui justifie une modification de skill

- Format imposé d'un livrable : sections d'une spec, gabarit de ticket Jira, champs obligatoires, langue des documents.
- Opérations du tracker qui diffèrent du texte (ex. `to-tickets` sur Jira : epic, sous-tâches, liens « is blocked by » via le MCP Atlassian, avec les vrais noms d'outils et de champs).
- Un skill existant du repo dont on intègre les règles avant de l'archiver : reporter ses consignes utiles dans la copie Matt correspondante, en citant leur origine dans le diff.
- Un agent spécialisé existant à utiliser à une étape précise (ex. « pour l'axe Standards de code-review, utiliser l'agent `company-reviewer` »).
- Un skill du repo à brancher : ajouter à l'étape concernée « utiliser le skill `<nom>` quand … », avec la condition précise. Pour qu'un agent dispose toujours d'un skill, l'ajouter au champ `skills:` de son frontmatter (`.claude/agents/<agent>.md`) plutôt que de recopier le skill.
- Une étape inapplicable au repo (ex. pas de typecheck en Python sans mypy : nommer la vraie commande).

## Ce qu'il faut préserver

- Le nom, la description et `disable-model-invocation` du frontmatter : ils décident quand le skill se déclenche.
- Les étapes et leur ordre : wayfinder résout des décisions, to-spec synthétise, to-tickets découpe en tranches verticales avec dépendances, implement réalise en TDD puis revue, implement-spec orchestre worktrees et fusions.
- Les fichiers de support (`references`, `scripts`, gabarits) et `LICENSE.mattpocock`.
- Les appels entre skills par leur nom (`tdd`, `code-review`) : les copies du projet portent ces noms et remplacent les commandes intégrées homonymes.

## Méthode

- Modifier le moins de lignes possible, en anglais si le skill l'est, et marquer le bloc ajouté par un titre `## Repo conventions` quand c'est un ajout plutôt qu'une correction.
- Une adaptation se justifie par un fichier du repo : le citer (`voir docs/specs/TEMPLATE.md`), plutôt que recopier son contenu.
- Montrer `git diff -- .claude/skills/<nom>` et un exemple de livrable produit avec la copie adaptée.
- Ne pas adapter « au cas où » : un skill que le repo n'utilise pas reste intact, ce qui facilite les mises à jour.
