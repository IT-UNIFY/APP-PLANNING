// Type-vérification des Edge Functions — porte LOCALE.
//
// POURQUOI CE SCRIPT EXISTE. `npm run typecheck` (tsc) ne voit PAS
// `supabase/functions/**` : ce code tourne sous Deno, avec un autre résolveur
// de modules, d'autres globaux (`Deno.env`) et des spécificateurs `npm:`. Sans
// ce script, tout le code Edge d'un projet instancié est **hors de `verify`** —
// ni typé, ni collecté, alors que c'est le code qui porte les gardes
// d'autorisation.
//
// ⚠️ Mesuré le 2026-09-09 : le squelette ne portait NI cette commande NI
// `test:edge`, si bien qu'un projet neuf n'avait aucun filet sur son code Edge.
// Les deux sont posées ensemble, parce qu'un type-check sans exécution et une
// exécution sans type-check laissent chacun la moitié du trou.
//
// La carte d'imports est celle du DÉPLOIEMENT — sinon on vérifie autre chose
// que ce qui partira. ⚠️ Deno cherche un `.npmrc` À CÔTÉ de la configuration
// qu'on lui donne : si le projet consomme un paquet du registre privé, il en
// faut un ici aussi. Voir `APP-TEMPLATE/recettes/edge-kit/PREREQUIS.md` §4.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = 'supabase/functions';
const CONFIG = join(RACINE, 'deno.json');

if (!existsSync(RACINE)) {
  console.log(`deno check — ${RACINE} absent, rien à vérifier.`);
  process.exit(0);
}

function fichiersTs(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
    else if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}

// ⭐ Liste DÉRIVÉE de l'arborescence, jamais écrite à la main : c'est ce qui
// empêche la porte de prendre du retard sur le code. Un fichier ajouté est
// vérifié sans que personne y pense.
const fichiers = fichiersTs(RACINE);

if (fichiers.length === 0) {
  console.log('deno check — aucun fichier .ts sous supabase/functions.');
  process.exit(0);
}

// 🔴 Deno REQUIS dès qu'il y a du code Edge : sortir 0 en son absence rendrait
// la porte verte sur du code non vérifié.
if (spawnSync('deno', ['--version'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    `deno check — ${fichiers.length} fichiers .ts sous ${RACINE}, mais Deno ` +
      "est absent de ce poste.\n" +
      '  La porte REFUSE plutôt que de passer au vert sur du code non vérifié.\n' +
      '  Installer Deno : https://deno.land/#installation',
  );
  process.exit(1);
}

console.log(`deno check — ${fichiers.length} fichiers`);

// `--no-lock` : sans lui, `deno check` réécrit `deno.lock` à chaque passage de
// la porte, et le dépôt se salit tout seul.
const args = ['check', '--no-lock'];
if (existsSync(CONFIG)) args.push('--config', CONFIG);
const res = spawnSync('deno', [...args, ...fichiers], { stdio: 'inherit' });
process.exit(res.status ?? 1);
