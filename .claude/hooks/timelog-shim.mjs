#!/usr/bin/env node
// Shim de câblage timelog par-projet. Committé ; c'est le SEUL hook versionné
// du dépôt. Il délègue au hook générique
// `~/.claude/hooks/<cible>.mjs` (couche perso multi-projets, hors dépôt)
// s'il est présent, sinon no-op silencieux : un coéquipier qui n'a
// pas cette couche n'a AUCUNE erreur (la voie worklog primaire est le MCP
// FixTracker). Le shim ne réimplémente jamais la logique de capture ; il relaie le
// stdin JSON du hook intact (stdio hérité) pour que la cible lise l'évènement.
// Ne bloque jamais la session : sort toujours en 0. La décision delegate/no-op
// vit dans shimLib.mjs (testée par Vitest).
import { spawnSync } from 'node:child_process';
import { resolveShimAction } from './shimLib.mjs';

const { action, path } = resolveShimAction(process.argv[2]);

if (action === 'delegate') {
  try {
    spawnSync(process.execPath, [path], { stdio: 'inherit' });
  } catch {
    // La capture du temps ne doit jamais bloquer la session.
  }
}

process.exit(0);
