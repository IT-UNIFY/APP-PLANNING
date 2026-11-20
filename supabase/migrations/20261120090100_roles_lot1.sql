-- =====================================================================
-- 20261120090100_roles_lot1.sql — APP-PLANNING, lot 1
--
-- Rôles minimaux du lot 1 : `roles`, `user_roles`, et le prédicat
-- `a_role()` que toutes les politiques RLS du schéma appellent.
--
-- POURQUOI PAS `@it-unify/rbac` : le paquet ne livre aucun SQL (mesuré à
-- la préparation du lot, plan du 2026-11-20, Q9). Ce modèle est
-- volontairement minimal — deux rôles, aucune permission fine — et se
-- remplacera par le modèle commun quand il existera.
--
-- Le carnet nomme trois rôles pour le lot 1 : administrateur du Planning,
-- lecteur des interventions, et intervenant. Le troisième est DONNÉ PAR
-- L'OUTIL INTERVENANT (ADR-001 D4 : l'intervenant n'a aucun compte dans
-- le Planning au lot 1) : il n'est donc pas dans ce catalogue.
--
-- RETRAIT = `revoque_le` POSÉ, JAMAIS UNE SUPPRESSION. Le carnet demande
-- un « retrait tracé dans l'historique des actions » ; une ligne supprimée
-- ne trace plus rien. Un déclencheur refuse donc le `delete`.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. roles — catalogue.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.roles (
  code text primary key,
  libelle text not null,
  created_at timestamptz not null default now()
);

comment on table public.roles is
  'Catalogue des rôles du Planning (lot 1). Le rôle « intervenant » n''y '
  'figure pas : il est donné par l''outil Intervenant.';

alter table public.roles enable row level security;

insert into public.roles (code, libelle) values
  ('admin_planning', 'Administrateur du Planning'),
  ('lecteur_interventions', 'Lecteur des interventions')
on conflict (code) do nothing;

-- Le catalogue n'est pas sensible : tout compte connecté le lit, pour
-- afficher le libellé de ses rôles.
drop policy if exists roles_select on public.roles;
create policy roles_select
  on public.roles for select to authenticated
  using (true);

revoke all on table public.roles from anon, authenticated;
-- service_role : droits accordés NOMMÉMENT. Les Edge Functions écrivent
-- sous ce rôle ; s'en remettre aux privilèges par défaut du projet, qui
-- peuvent différer d'une image à l'autre, ferait échouer l'import en
-- production sans que rien ne le signale ici. 20261120090700 le vérifie.
grant select on table public.roles to service_role;
grant select on table public.roles to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. user_roles — attributions datées.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  -- `on delete restrict` : supprimer un compte qui a porté un rôle
  -- effacerait la trace de l'attribution. On désactive un compte
  -- (`profiles.is_active = false`), on ne le supprime pas.
  user_id uuid not null references auth.users (id) on delete restrict,
  role_code text not null references public.roles (code),
  accorde_par uuid references auth.users (id) on delete set null,
  accorde_le timestamptz not null default now(),
  revoque_le timestamptz,
  constraint user_roles_revocation_apres_accord
    check (revoque_le is null or revoque_le >= accorde_le)
);

comment on table public.user_roles is
  'Attributions de rôle. Un retrait pose revoque_le ; la ligne reste, comme '
  'trace. Écritures par Edge Functions (service_role) uniquement.';

-- Une seule attribution ACTIVE par (personne, rôle). Les attributions
-- révoquées s'empilent librement : c'est l'historique.
create unique index if not exists user_roles_une_active
  on public.user_roles (user_id, role_code)
  where revoque_le is null;

create index if not exists user_roles_role_code_idx on public.user_roles (role_code);

alter table public.user_roles enable row level security;

drop trigger if exists trg_user_roles_pas_de_suppression on public.user_roles;
create trigger trg_user_roles_pas_de_suppression
  before delete on public.user_roles
  for each row execute function public.refuser_ecriture('retirer un rôle = poser revoque_le');

-- ─────────────────────────────────────────────────────────────────────
-- 3. a_role(code) — le prédicat de toutes les politiques.
--
--    security definer : il lit `user_roles` et `profiles`, que la RLS
--    protège ; sans definer, une politique sur `user_roles` qui
--    l'appellerait se rappellerait elle-même.
--
--    Il exige un profil ACTIF : désactiver un compte retire tous ses
--    droits sans toucher aux attributions, qui restent la trace.
--
--    search_path vide : un definer avec un search_path modifiable par
--    l'appelant est une élévation de privilège classique.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.a_role(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id
     where ur.user_id = (select auth.uid())
       and ur.role_code = p_code
       and ur.revoque_le is null
       and p.is_active
  );
$$;

-- `revoke … from public` ne retire PAS le grant nominatif d'`anon` posé
-- par les privilèges par défaut (AGENTS.md §4 bis) : les deux lignes.
revoke all on function public.a_role(text) from public;
revoke all on function public.a_role(text) from anon;
grant execute on function public.a_role(text) to authenticated;

comment on function public.a_role(text) is
  'Vrai si l''utilisateur courant (auth.uid()) porte le rôle p_code, non '
  'révoqué, avec un profil actif. Prédicat des politiques RLS du Planning.';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Politiques qui dépendent de a_role().
--    `(select …)` autour de l'appel : Postgres l'évalue une fois par
--    requête (initplan) au lieu d'une fois par ligne.
-- ─────────────────────────────────────────────────────────────────────

-- user_roles : chacun voit ses propres attributions ; l'administrateur
-- voit celles des autres (écran « Utilisateurs et accès »).
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select
  on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.a_role('admin_planning'))
  );

revoke all on table public.user_roles from anon, authenticated;
grant select, insert, update on table public.user_roles to service_role;
-- Retirer un rôle = poser revoque_le : ni `delete` ni `truncate`.
revoke delete, truncate on table public.user_roles from service_role;
grant select on table public.user_roles to authenticated;

-- profiles : l'administrateur lit tous les profils (liste des personnes
-- et de leurs accès). La lecture de son propre profil est dans 090000.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles for select to authenticated
  using ((select public.a_role('admin_planning')));

-- audit_log : « Historique des actions », réservé à l'administrateur.
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log for select to authenticated
  using ((select public.a_role('admin_planning')));
