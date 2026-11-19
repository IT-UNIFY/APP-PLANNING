// Déploiement des Edge Functions — trois garde-fous, et une règle de liste.
//
// Origine : `scripts/deploy-edge.mjs` d'APP-FACTU, repris ici le 2026-09-10
// après avoir été exercé à l'échelle chez eux (16 fonctions × 2
// environnements, 0 échec, drapeaux relus à la source et conformes 16 fois).
// Le squelette n'en portait aucun : un projet neuf déployait à la main, sans
// aucune des protections ci-dessous.
//
// ═══════════════════════════════════════════════════════════════════════
// LES QUATRE PIÈGES, ET POURQUOI CHACUN EST UN REFUS ET NON UN AVERTISSEMENT
// ═══════════════════════════════════════════════════════════════════════
//
// 🔴 1. UN REDÉPLOIEMENT RÉINITIALISE `verify_jwt`.
// La CLI lit `config.toml`, mais le drapeau ne survit pas toujours au
// redéploiement. Une fonction publique **refermée** est un incident
// TOTALEMENT SILENCIEUX : le retour OAuth rend 401 et rien à l'écran ne
// l'explique. Ce script repasse donc le drapeau EXPLICITEMENT à chaque
// déploiement, puis le **relit à la source** (`functions list`) après coup.
// ⭐ Ne jamais répondre à « cette fonction est-elle publique ? » en lisant le
// fichier de configuration. Lire l'état réel.
//
// 🔴 2. `--use-api` IGNORE `static_files`.
// Une fonction qui lit un asset hors du graphe d'imports (`Deno.readFile`)
// serait déployée SANS cet asset et rendrait 500 « path not found » au
// premier appel — à l'exécution, donc bien après un déploiement « réussi ».
// Chez APP-FACTU, cela a failli casser les PDF de production. Le script
// REFUSE `--use-api` pour toute fonction déclarant `static_files`.
//
// 🔴 3. `--use-api` NE JOINT PAS LA CARTE D'IMPORTS.
// Défaut de sens opposé au précédent : une fonction qui importe par nom
// (`@supabase/supabase-js`, résolu par `supabase/functions/deno.json`) échoue
// en **400 à l'empaquetage** — « Relative import path … not prefixed with / or
// ./ or ../ ». Bonne nouvelle : l'échec est FRANC et IMMÉDIAT. Le drapeau
// `--carte` joint la carte, et **refuse d'être passé sans `--use-api`** : en
// mode Docker la CLI lit `deno.json` toute seule, et un drapeau sans effet
// trahit une méprise sur le mode réellement employé.
//
// 🔴 4. UN DÉPLOIEMENT NE MET PAS À JOUR — IL CRÉE.  ⬅ AJOUT DU SQUELETTE
// Signalé par APP-FACTU le 2026-09-10, et ce trou-là n'est pas dans le
// script : il est dans la façon de construire la LISTE. Pour savoir quoi
// redéployer après avoir touché `_shared/**`, on parcourt le graphe d'imports.
// C'est fiable pour « qui est AFFECTÉ ? ». Ce n'est pas « qui EXISTE sur
// l'environnement cible ? ».
//
// Ce que ça a coûté chez eux : `facturx-preview` — outillage de
// développement, documentée « preprod uniquement » — a été **créée en
// production** par un déploiement groupé.
//
// ⭐ LA RÈGLE, ET ELLE EST LE DÉFAUT ICI :
//   1. l'ensemble AFFECTÉ vient de l'appelant (graphe d'imports, ou la main) ;
//   2. l'ensemble DÉPLOYÉ est lu sur la cible (`functions list`) ;
//   3. on déploie l'INTERSECTION, et on ÉNONCE ce que la différence contient.
//
// Créer une fonction est alors un acte EXPLICITE : `--creer`. Sans lui, une
// fonction absente de la cible est écartée en le disant, jamais créée par
// surprise. **Une fonction absente d'un environnement est une DÉCISION jusqu'à
// preuve du contraire** — chercher sa trace (HANDOFF, ADR) avant de l'annuler
// par un déploiement.
//
// ═══════════════════════════════════════════════════════════════════════
//
// Usage :
//   node scripts/deploy-edge.mjs --project-ref <ref> <fonction>…
//   node scripts/deploy-edge.mjs --project-ref <ref> --creer <nouvelle>…
//   node scripts/deploy-edge.mjs --project-ref <ref> --use-api <fonction>…
//   node scripts/deploy-edge.mjs --project-ref <ref> --use-api --carte <f>…
//   node scripts/deploy-edge.mjs --project-ref <ref> --dry-run <fonction>…
//
// Le jeton vient de `SUPABASE_ACCESS_TOKEN` (environnement, sinon `.env`).
// Il n'est JAMAIS affiché : seule sa présence l'est.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const useApi = args.includes('--use-api');
const carte = args.includes('--carte');
const creer = args.includes('--creer');

function valeurOption(nom) {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
}

const projectRef = valeurOption('--project-ref');
const demandees = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--project-ref',
);

// POURQUOI PAS `dotenv`. Node 22 fournit `process.loadEnvFile()` en natif.
// Le fichier n'écrase PAS une variable déjà posée : un `SUPABASE_ACCESS_TOKEN=…`
// devant la commande reste prioritaire, ce qui est le comportement attendu
// quand on cible ponctuellement un autre compte.
const racine = resolve(process.cwd());
const cheminEnv = resolve(racine, '.env');
if (existsSync(cheminEnv)) {
  process.loadEnvFile(cheminEnv);
} else {
  console.error(`avertissement : ${cheminEnv} absent`);
}

const jeton = process.env.SUPABASE_ACCESS_TOKEN;

// Lecture minimale de `config.toml` : par fonction, `verify_jwt` et la
// présence de `static_files`. Pas de bibliothèque TOML — deux clés dans des
// sections `[functions.<nom>]` ne la justifient pas.
function lireConfigFonctions() {
  const chemin = resolve(racine, 'supabase', 'config.toml');
  if (!existsSync(chemin)) return new Map();
  const config = new Map();
  let courante = null;
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const section = ligne.match(/^\s*\[functions\.([^\]]+)\]/);
    if (section) {
      courante = section[1];
      config.set(courante, { verifyJwt: true, staticFiles: false });
      continue;
    }
    if (ligne.startsWith('[')) { courante = null; continue; }
    if (!courante) continue;
    const vj = ligne.match(/^\s*verify_jwt\s*=\s*(true|false)/);
    if (vj) config.get(courante).verifyJwt = vj[1] === 'true';
    if (/^\s*static_files\s*=/.test(ligne)) {
      config.get(courante).staticFiles = true;
    }
  }
  return config;
}

const CONFIG = lireConfigFonctions();

if (!projectRef || demandees.length === 0) {
  console.error('usage : node scripts/deploy-edge.mjs --project-ref <ref>' +
                ' [--creer] [--use-api [--carte]] [--dry-run] <fonction>…');
  process.exit(1);
}
if (!jeton) {
  console.error("SUPABASE_ACCESS_TOKEN absent — ni dans l'environnement," +
                ' ni dans .env');
  process.exit(1);
}
if (carte && !useApi) {
  console.error("--carte n'a de sens qu'avec --use-api : en mode Docker la");
  console.error('CLI lit déjà supabase/functions/deno.json.');
  process.exit(1);
}
if (useApi) {
  const aAssets = demandees.filter((f) => CONFIG.get(f)?.staticFiles);
  if (aAssets.length) {
    console.error(`--use-api IGNORE static_files : ${aAssets.join(', ')}`);
    console.error('Ces fonctions rendraient 500 « path not found » au premier');
    console.error('appel. Les déployer avec Docker, séparément.');
    process.exit(1);
  }
}

function supabase(argv, options = {}) {
  return execFileSync('supabase', argv, {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: jeton },
    encoding: 'utf8',
    stdio: options.capturer ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

/** Les fonctions réellement présentes sur la cible, ou `null` si illisible. */
function deployeesSurLaCible() {
  try {
    const brut = supabase(['functions', 'list', '--project-ref', projectRef],
                          { capturer: true });
    const json = JSON.parse(brut);
    const toutes = Array.isArray(json) ? json : (json.functions ?? []);
    return new Map(toutes.map((f) => [f.slug, f]));
  } catch {
    return null;
  }
}

console.error(`jeton      : présent (${jeton.length} caractères)`);
console.error(`projet     : ${projectRef}`);
console.error(`empaquetage: ${useApi ? 'API de gestion' : 'Docker'}` +
              (carte ? " + carte d'imports" : ''));

// ── La règle de l'intersection (piège 4) ─────────────────────────────
const existantes = deployeesSurLaCible();
let fonctions = demandees;

if (existantes === null) {
  // 🔴 FAIL-SAFE, ET DANS LE SENS PRUDENT. On ne sait pas ce qui existe sur la
  // cible : on ne peut donc pas garantir qu'aucune création n'aura lieu. On
  // REFUSE, au lieu de déployer en aveugle. Passer `--creer` assume la
  // création et lève le refus.
  if (!creer) {
    console.error('\n🔴 `functions list` illisible — impossible de savoir ce qui');
    console.error('   existe déjà sur la cible. Un déploiement CRÉE ce qui');
    console.error("   n'existe pas ; on refuse plutôt que de créer à l'aveugle.");
    console.error('   Relancer avec --creer pour assumer la création.');
    process.exit(1);
  }
  console.error('avertissement : `functions list` illisible, --creer assume la création');
} else {
  const absentes = demandees.filter((f) => !existantes.has(f));
  if (absentes.length && !creer) {
    fonctions = demandees.filter((f) => existantes.has(f));
    console.error('');
    console.error('── écartées : absentes de la cible ──');
    for (const f of absentes) {
      console.error(`   ${f.padEnd(28)} n'existe pas sur ${projectRef}`);
    }
    console.error('   Un déploiement ne met pas à jour ce qui n\'existe pas : IL CRÉE.');
    console.error('   Une fonction absente d\'un environnement est une DÉCISION');
    console.error('   jusqu\'à preuve du contraire — chercher sa trace (HANDOFF,');
    console.error('   ADR) avant de l\'annuler. Pour créer volontairement : --creer.');
  } else if (absentes.length && creer) {
    console.error('');
    console.error(`── seront CRÉÉES (--creer) : ${absentes.join(', ')} ──`);
  }
}

if (fonctions.length === 0) {
  console.error('\nAucune fonction à déployer après application de la règle.');
  process.exit(0);
}
console.error(`\nfonctions  : ${fonctions.join(', ')}`);
console.error('');

// Le drapeau est repassé EXPLICITEMENT à chaque déploiement (piège 1).
function argumentsFonction(f) {
  const conf = CONFIG.get(f);
  const argv = ['functions', 'deploy', f, '--project-ref', projectRef];
  if (useApi) argv.push('--use-api');
  if (carte) argv.push('--import-map', 'supabase/functions/deno.json');
  if (conf && conf.verifyJwt === false) argv.push('--no-verify-jwt');
  return argv;
}

if (dryRun) {
  console.error("— dry-run : rien n'est déployé —");
  for (const f of fonctions) {
    console.error(`  supabase ${argumentsFonction(f).join(' ')}`);
  }
  process.exit(0);
}

// Une fonction à la fois : un échec dit alors LAQUELLE, et les précédentes
// restent déployées. Un déploiement groupé rend le diagnostic plus flou.
let echecs = 0;
for (const f of fonctions) {
  console.error(`→ ${f}`);
  try {
    supabase(argumentsFonction(f));
  } catch {
    console.error(`   ÉCHEC sur ${f}`);
    echecs += 1;
  }
  console.error('');
}

// ── Contrôle à la source, quoi qu'il arrive (piège 1) ────────────────
// C'est le drapeau RÉEL qui compte, pas celui qu'on a demandé. Comparé à
// `config.toml` : une divergence est signalée, pas seulement affichée.
console.error('── drapeaux relus à la source (functions list) ──');
const apres = deployeesSurLaCible();
if (apres === null) {
  console.error('lecture de functions list impossible — à vérifier à la main');
  echecs += 1;
} else {
  for (const f of fonctions) {
    const reelle = apres.get(f);
    if (!reelle) {
      console.error(`${f.padEnd(28)} ABSENTE de la liste`);
      echecs += 1;
      continue;
    }
    const attendu = CONFIG.get(f)?.verifyJwt ?? true;
    const diverge = attendu !== reelle.verify_jwt;
    console.error(
      `${f.padEnd(28)} verify_jwt = ${String(reelle.verify_jwt).padEnd(5)}` +
      ` version ${String(reelle.version).padEnd(4)}` +
      (diverge ? `  🔴 DIVERGE de config.toml (${attendu})` : '  ok'),
    );
    if (diverge) echecs += 1;
  }
}

process.exit(echecs === 0 ? 0 : 1);
