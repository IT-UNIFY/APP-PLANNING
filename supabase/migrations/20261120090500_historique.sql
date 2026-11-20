-- =====================================================================
-- 20261120090500_historique.sql — APP-PLANNING, lot 1
--
-- Historique daté des interventions et des affectations (ADR-001 D6).
--
-- POURQUOI : l'outil Intervenant ne garde PAS de copie des séances (« les
-- autres les lisent sans copie », carnet). En échange, le Planning
-- garantit la preuve : un contrat ou une DPAE se justifie par
-- « l'affectation X telle qu'elle était le jour J ». Cette table est donc
-- une PIÈCE JUSTIFICATIVE : elle grossit sans fin, se surveille, ne se
-- purge pas, et ne se réécrit jamais.
--
-- MÉCANIQUE :
--   * AFTER INSERT OR UPDATE sur la table suivie : une ligne d'historique
--     seulement si une colonne SUIVIE change (`*_suivi_change()`, défini
--     dans 20261120090400 — même liste que `updated_at`). Une mise à jour
--     sans changement n'écrit rien.
--   * `valide_depuis` = heure de TRANSACTION du Planning (Q10). Deux
--     écritures dans la même transaction ont la même heure : l'ordre total
--     se fait par (`valide_depuis`, `id`), et l'état final de la
--     transaction est la dernière ligne.
--   * L'import passe son identifiant par
--     `select set_config('planning.import_id', '<uuid>', true)` — local à
--     la transaction, donc sans fuite vers une autre requête du pool.
--
-- AJOUT SEUL, À TROIS NIVEAUX — chacun ferme ce que l'autre laisse :
--   1. aucun droit d'écriture pour aucun rôle d'API, `service_role`
--      compris : seule la fonction de déclencheur (security definer)
--      insère, donc on ne peut pas FABRIQUER une ligne d'historique ;
--   2. déclencheurs BEFORE UPDATE/DELETE (ligne) et BEFORE TRUNCATE
--      (instruction) : ils arrêtent aussi le propriétaire et toute
--      migration future, que les droits n'arrêtent pas ;
--   3. assertion de 20261120090700, qui refuse de terminer la migration
--      si un rôle d'API a retrouvé un droit d'écriture.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. interventions_historique
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.interventions_historique (
  id bigint generated always as identity primary key,
  intervention_id uuid not null references public.interventions (id),
  valide_depuis timestamptz not null default now(),
  import_id uuid references public.imports_aurion (id),
  operation text not null check (operation in ('insert', 'update')),
  -- Copie typée des colonnes suivies (+ aurion_maj_le, en information).
  aurion_seance_id text,
  debut timestamptz not null,
  fin timestamptz not null,
  cours_code text,
  cours_intitule text,
  type_activite text,
  modalite text,
  salle_id uuid,
  salle_nom_aurion text,
  etat_aurion text,
  statut text not null,
  retiree_le timestamptz,
  aurion_maj_le timestamptz
);

comment on table public.interventions_historique is
  'États successifs d''une intervention, datés (heure de transaction du '
  'Planning). Ajout seul : pièce justificative (ADR-001 D6), jamais purgée.';

create index if not exists interventions_historique_ligne_idx
  on public.interventions_historique (intervention_id, valide_depuis desc);

alter table public.interventions_historique enable row level security;

-- ─────────────────────────────────────────────────────────────────────
-- 2. affectations_historique
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.affectations_historique (
  id bigint generated always as identity primary key,
  affectation_id uuid not null references public.affectations (id),
  valide_depuis timestamptz not null default now(),
  import_id uuid references public.imports_aurion (id),
  operation text not null check (operation in ('insert', 'update')),
  -- Copie typée des colonnes suivies.
  intervention_id uuid not null,
  aurion_individu_id text not null,
  aurion_intervention_id text,
  role text,
  statut text not null,
  statut_aurion text,
  statut_depuis timestamptz not null,
  remplacee_par uuid
);

comment on table public.affectations_historique is
  'États successifs d''une affectation, datés (heure de transaction du '
  'Planning). Ajout seul : pièce justificative (ADR-001 D6), jamais purgée. '
  'Les horaires de la séance à la date J sont dans interventions_historique.';

create index if not exists affectations_historique_ligne_idx
  on public.affectations_historique (affectation_id, valide_depuis desc);

alter table public.affectations_historique enable row level security;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Fonctions de déclencheur — security definer.
--
--    definer : aucun rôle d'API n'a `insert` sur les tables d'historique
--    (point 1 de l'en-tête). La fonction insère avec les droits de son
--    propriétaire, et c'est le SEUL chemin d'écriture.
--
--    `nullif(…, '')::uuid` : un identifiant d'import mal formé fait
--    échouer l'écriture, plutôt que d'enregistrer une preuve rattachée à
--    rien.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.interventions_historiser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or public.interventions_suivi_change(old, new) then
    insert into public.interventions_historique (
      intervention_id, import_id, operation,
      aurion_seance_id, debut, fin, cours_code, cours_intitule,
      type_activite, modalite, salle_id, salle_nom_aurion,
      etat_aurion, statut, retiree_le, aurion_maj_le
    ) values (
      new.id, nullif(current_setting('planning.import_id', true), '')::uuid, lower(tg_op),
      new.aurion_seance_id, new.debut, new.fin, new.cours_code, new.cours_intitule,
      new.type_activite, new.modalite, new.salle_id, new.salle_nom_aurion,
      new.etat_aurion, new.statut, new.retiree_le, new.aurion_maj_le
    );
  end if;
  return null;
end;
$$;

create or replace function public.affectations_historiser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or public.affectations_suivi_change(old, new) then
    insert into public.affectations_historique (
      affectation_id, import_id, operation,
      intervention_id, aurion_individu_id, aurion_intervention_id,
      role, statut, statut_aurion, statut_depuis, remplacee_par
    ) values (
      new.id, nullif(current_setting('planning.import_id', true), '')::uuid, lower(tg_op),
      new.intervention_id, new.aurion_individu_id, new.aurion_intervention_id,
      new.role, new.statut, new.statut_aurion, new.statut_depuis, new.remplacee_par
    );
  end if;
  return null;
end;
$$;

revoke all on function public.interventions_historiser() from public;
revoke all on function public.interventions_historiser() from anon;
revoke all on function public.interventions_historiser() from authenticated;
revoke all on function public.affectations_historiser() from public;
revoke all on function public.affectations_historiser() from anon;
revoke all on function public.affectations_historiser() from authenticated;

drop trigger if exists trg_interventions_historiser on public.interventions;
create trigger trg_interventions_historiser
  after insert or update on public.interventions
  for each row execute function public.interventions_historiser();

drop trigger if exists trg_affectations_historiser on public.affectations;
create trigger trg_affectations_historiser
  after insert or update on public.affectations
  for each row execute function public.affectations_historiser();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Ajout seul — déclencheurs (point 2 de l'en-tête).
-- ─────────────────────────────────────────────────────────────────────
drop trigger if exists trg_interventions_historique_ajout_seul on public.interventions_historique;
create trigger trg_interventions_historique_ajout_seul
  before update or delete on public.interventions_historique
  for each row execute function public.refuser_ecriture('historique en ajout seul (pièce justificative, ADR-001 D6)');

drop trigger if exists trg_interventions_historique_ajout_seul_truncate on public.interventions_historique;
create trigger trg_interventions_historique_ajout_seul_truncate
  before truncate on public.interventions_historique
  for each statement execute function public.refuser_ecriture('historique en ajout seul (pièce justificative, ADR-001 D6)');

drop trigger if exists trg_affectations_historique_ajout_seul on public.affectations_historique;
create trigger trg_affectations_historique_ajout_seul
  before update or delete on public.affectations_historique
  for each row execute function public.refuser_ecriture('historique en ajout seul (pièce justificative, ADR-001 D6)');

drop trigger if exists trg_affectations_historique_ajout_seul_truncate on public.affectations_historique;
create trigger trg_affectations_historique_ajout_seul_truncate
  before truncate on public.affectations_historique
  for each statement execute function public.refuser_ecriture('historique en ajout seul (pièce justificative, ADR-001 D6)');

-- ─────────────────────────────────────────────────────────────────────
-- 5. Droits (point 1 de l'en-tête).
--    Les privilèges par défaut de Supabase donnent `all` à anon,
--    authenticated ET service_role : on les retire NOMMÉMENT à chacun
--    (AGENTS.md §4 bis). Il ne reste que la lecture pour authenticated,
--    bornée par la RLS.
-- ─────────────────────────────────────────────────────────────────────
revoke all on table public.interventions_historique from anon, authenticated;
revoke insert, update, delete, truncate on table public.interventions_historique from service_role;
grant select on table public.interventions_historique to service_role;
grant select on table public.interventions_historique to authenticated;

revoke all on table public.affectations_historique from anon, authenticated;
revoke insert, update, delete, truncate on table public.affectations_historique from service_role;
grant select on table public.affectations_historique to service_role;
grant select on table public.affectations_historique to authenticated;

-- Les séquences d'identité : `usage` permettrait de consommer des
-- numéros, et rien d'autre ne doit y toucher que le déclencheur.
revoke all on sequence public.interventions_historique_id_seq from anon, authenticated, service_role;
revoke all on sequence public.affectations_historique_id_seq from anon, authenticated, service_role;

drop policy if exists interventions_historique_select on public.interventions_historique;
create policy interventions_historique_select
  on public.interventions_historique for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

drop policy if exists affectations_historique_select on public.affectations_historique;
create policy affectations_historique_select
  on public.affectations_historique for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );
