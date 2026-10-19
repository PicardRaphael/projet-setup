#!/usr/bin/env node
// Hook PreToolUse (Bash) : impose les bons outils du repo, par un refus expliqué plutôt qu'une consigne dans CLAUDE.md.
// Arguments : paires mauvais=bon, ex. node .claude/hooks/use-cli.mjs npm=pnpm npx="pnpm dlx" yarn=pnpm
let input = '';
process.stdin.on('data', chunk => (input += chunk)).on('end', () => {
  const command = JSON.parse(input || '{}').tool_input?.command || '';
  for (const pair of process.argv.slice(2)) {
    const [wrong, right] = pair.split('=');
    if (!wrong || !right) continue;
    // Le mot interdit en position de commande : début, ou après ; && || | ( et espaces.
    const used = new RegExp('(^|[;&|(]\\s*|&&\\s*|\\|\\|\\s*)' + wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(command.trim());
    if (used) {
      process.stderr.write('Ce repo utilise `' + right + '` à la place de `' + wrong + '`. Relance la commande avec `' + right + '`.\n');
      process.exit(2);
    }
  }
});
