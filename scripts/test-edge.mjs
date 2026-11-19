// Exécution des tests Edge écrits pour Deno — porte LOCALE.
//
// POURQUOI CE SCRIPT EXISTE, et il existe AVANT le premier test Edge.
// `vitest` ne sait pas exécuter un test qui utilise l'API `Deno.test` : le
// global `Deno` n'y est pas. Un tel test posé sous `supabase/functions/**` a
// donc deux issues, et les deux sont mauvaises sans ce script :
//
//   - laissé dans la liste blanche de `vitest.config.ts`, il échoue en
//     « Deno is not defined » — bruyant, mais au moins visible ;
//   - exclu « parce qu'il tourne sous deno test », il n'est plus exécuté par
//     RIEN. Silencieux, et c'est le cas dangereux.
//
// ⚠️ MESURÉ CHEZ APP-FACTU LE 2026-09-09, ET C'EST POURQUOI CE FICHIER EST ICI.
// 25 fichiers de test y étaient dans le second cas : typés par `deno check`,
// exécutés par aucune commande. Parmi eux des défenses de sécurité — un test
// d'injection de prompt et un test d'assainissement HTML — qui n'avaient
// JAMAIS tourné. Deux étaient rouges depuis des semaines. Le `vitest.config.ts`
// affirmait « ils tournent sous `deno test` » ; aucune commande de ce nom
// n'existait dans le dépôt. Script d'origine : `scripts/test-edge.mjs`
// d'APP-FACTU, repris ici pour que le squelette ne puisse pas propager le
// défaut.
//
// ⭐ LA RÈGLE EST DÉRIVÉE, PAS LISTÉE. Un fichier est un test Deno s'il
// CONTIENT `Deno.test`. Une liste en dur aurait de nouveau laissé passer le
// prochain fichier posé au mauvais endroit — c'est arrivé trois fois chez
// APP-FACTU avant d'être fermé ainsi.
//
// En Node plutôt qu'en shell : `npm run` doit marcher pareil sous PowerShell,
// Git Bash et un hook `pre-push`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = 'supabase/functions';
// Les tests importent les modules d'exécution : il leur faut la MÊME carte
// d'imports que le déploiement, sinon ils testent autre chose.
const CONFIG = join(RACINE, 'deno.json');

// Un projet instancié peut n'avoir aucune Edge Function. Ce n'est pas une
// erreur, et surtout ce n'est pas une raison de faire échouer `verify`.
if (!existsSync(RACINE)) {
  console.log(`deno test — ${RACINE} absent, rien à exécuter.`);
  process.exit(0);
}

function fichiersTest(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiersTest(p));
    else if (e.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const denoTests = fichiersTest(RACINE).filter((f) =>
  readFileSync(f, 'utf8').includes('Deno.test'),
);

if (denoTests.length === 0) {
  console.log('deno test — aucun fichier `Deno.test` trouvé.');
  process.exit(0);
}

// 🔴 Deno est REQUIS dès qu'un test Deno existe. Sortir 0 en son absence
// rendrait la porte verte sur des tests non exécutés — exactement le défaut
// que ce script ferme. On refuse, et on le dit.
const versionDeno = spawnSync('deno', ['--version'], { stdio: 'ignore' });
if (versionDeno.status !== 0) {
  console.error(
    `deno test — ${denoTests.length} fichiers \`Deno.test\` trouvés, mais ` +
      'Deno est absent de ce poste.\n' +
      "  La porte REFUSE plutôt que de passer au vert sur des tests non exécutés.\n" +
      '  Installer Deno : https://deno.land/#installation',
  );
  process.exit(1);
}

console.log(`deno test — ${denoTests.length} fichiers`);

// Permissions MINIMALES et explicites, jamais `-A` : un test qui réclamerait
// le réseau n'est pas un test unitaire, et on veut qu'il échoue franchement.
// `--no-lock` : éviter que la porte réécrive `deno.lock`.
const args = ['test', '--no-lock', '--allow-env', '--allow-read'];
if (existsSync(CONFIG)) args.push('--config', CONFIG);
const res = spawnSync('deno', [...args, ...denoTests], { stdio: 'inherit' });
process.exit(res.status ?? 1);
