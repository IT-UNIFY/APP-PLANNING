-- =====================================================================
-- 20261120090300_imports_aurion.sql — APP-PLANNING, lot 1
--
-- Journal des imports Aurion et anomalies relevées.
--
-- Sert l'écran « Paramètres › Import Aurion » de la maquette (L1-Import) :
-- dernier et prochain import, compteurs (lues, nouvelles, modifiées,
-- retirées, anomalies), liste des anomalies, historique des imports.
--
-- Hors lot (plan du 2026-11-20) : les identifiants Aurion en base et le
-- cron d'import, qui arrivent avec l'Edge Function d'import.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. imports_aurion — une ligne par exécution.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.imports_aurion (
  id uuid primary key default gen_random_uuid(),
  declenchement text not null
    check (declenchement in ('automatique', 'manuel')),
  -- Qui a lancé un import manuel. `set null` : l'historique des imports
  -- survit à la suppression d'un compte.
  lance_par uuid references auth.users (id) on delete set null,
  debut timestamptz not null default now(),
  fin timestamptz,
  statut text not null default 'en_cours'
    check (statut in ('en_cours', 'reussi', 'reussi_avec_anomalies', 'echec')),
  message text,
  nb_lues integer not null default 0 check (nb_lues >= 0),
  nb_nouvelles integer not null default 0 check (nb_nouvelles >= 0),
  nb_modifiees integer not null default 0 check (nb_modifiees >= 0),
  nb_retirees integer not null default 0 check (nb_retirees >= 0),
  nb_anomalies integer not null default 0 check (nb_anomalies >= 0),
  created_at timestamptz not null default now(),
  constraint imports_aurion_fin_apres_debut check (fin is null or fin >= debut),
  -- Un import terminé a une fin : sans elle, l'écran afficherait un import
  -- « réussi » dont on ne sait pas quand.
  constraint imports_aurion_termine_a_une_fin check (statut = 'en_cours' or fin is not null)
);

comment on table public.imports_aurion is
  'Exécutions de l''import Aurion : déclenchement, durée, statut, '
  'compteurs. Écrit par l''Edge Function d''import (service_role).';

-- UN SEUL IMPORT EN COURS À LA FOIS. Pourquoi en base : le cron de nuit
-- et un import manuel peuvent partir ensemble ; deux imports concurrents
-- compareraient chacun Aurion à un état que l'autre est en train de
-- changer, et poseraient deux fois les mêmes retraits. Seule une
-- contrainte d'unicité tranche une course. Un import resté bloqué en
-- `en_cours` (fonction tuée) se débloque en passant sa ligne en `echec`.
create unique index if not exists imports_aurion_un_seul_en_cours
  on public.imports_aurion (statut)
  where statut = 'en_cours';

create index if not exists imports_aurion_debut_idx
  on public.imports_aurion (debut desc);

alter table public.imports_aurion enable row level security;

-- Le lecteur des interventions voit la date du dernier import (la
-- fraîcheur de ce qu'il lit) ; l'administrateur pilote l'import.
drop policy if exists imports_aurion_select on public.imports_aurion;
create policy imports_aurion_select
  on public.imports_aurion for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

revoke all on table public.imports_aurion from anon, authenticated;
-- service_role : droits accordés NOMMÉMENT. Les Edge Functions écrivent
-- sous ce rôle ; s'en remettre aux privilèges par défaut du projet, qui
-- peuvent différer d'une image à l'autre, ferait échouer l'import en
-- production sans que rien ne le signale ici. 20261120090700 le vérifie.
grant select, insert, update on table public.imports_aurion to service_role;
grant select on table public.imports_aurion to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. anomalies_import — ce qui est à corriger À LA SOURCE (Aurion).
--
--    Une séance en anomalie est quand même importée (maquette L1-Import) :
--    l'anomalie ne bloque rien, elle dit où corriger.
--
--    `intervention_id` est NULL quand la séance n'a pas pu être importée
--    du tout. Sa clé étrangère vers `interventions` est posée dans
--    20261120090400, qui crée cette table-là.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.anomalies_import (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports_aurion (id),
  intervention_id uuid,
  aurion_seance_id text,
  -- CHECK fermé : un type inconnu doit faire échouer l'écriture plutôt
  -- que d'afficher à l'administrateur une anomalie sans libellé.
  -- `donnee_invalide` couvre une ligne Aurion que les contraintes de la
  -- table refusent (par exemple une fin avant le début).
  type text not null check (type in (
    'intervenant_sans_fiche',
    'seance_sans_intervenant',
    'salle_inconnue',
    'donnee_invalide'
  )),
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.anomalies_import is
  'Anomalies relevées par un import : à corriger dans Aurion. N''empêchent '
  'pas l''import de la séance. Réservées à l''administrateur du Planning.';

create index if not exists anomalies_import_import_id_idx
  on public.anomalies_import (import_id);

alter table public.anomalies_import enable row level security;

-- Administrateur seul : les anomalies nomment des séances à corriger et
-- relèvent du pilotage de l'import, pas de la consultation.
drop policy if exists anomalies_import_select on public.anomalies_import;
create policy anomalies_import_select
  on public.anomalies_import for select to authenticated
  using ((select public.a_role('admin_planning')));

revoke all on table public.anomalies_import from anon, authenticated;
grant select, insert, update on table public.anomalies_import to service_role;
grant select on table public.anomalies_import to authenticated;
