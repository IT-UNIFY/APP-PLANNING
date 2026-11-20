-- =====================================================================
-- 20261120090000_socle_profils_m365_audit.sql — APP-PLANNING, lot 1
--
-- Socle commun au parc : profils, connexion Microsoft 365, journal d'audit.
-- Ce fichier pose ce que le code VENDORISÉ appelle déjà, et rien de plus :
--
--   * `supabase/functions/m365-login-callback/index.ts` lit
--     `m365_tenants (id, tenant_id, client_id, purpose, email_domains)`,
--     `profiles (is_active, sso_provider)`, et appelle les RPC
--     `m365_tenant_secret(p_id)` et `find_auth_user_by_email(p_email)` ;
--   * `_shared/socle/m365-auth/locataireM365.ts` appelle
--     `m365_tenant_for_email(p_email)` et attend
--     `(tenant_row_id, tenant_id, client_id)` ;
--   * `_shared/socle/edge/auth.ts` (`ecrireAudit`) écrit dans `audit_log`
--     les colonnes `actor_id, action, table_name, row_id, before, after`.
--
-- Forme reprise d'APP-FACTU (`20260901170001_m365_tenants_socle`,
-- `20260902062629_find_auth_user_by_email`, `20260624120002_audit_log`,
-- `20260624120008_extend_audit_action`) et d'APP-MSP
-- (`0007_audit_login_une_ligne_par_session`). Écart voulu avec APP-FACTU :
-- la RPC de lecture du secret s'appelle `m365_tenant_secret(p_id)`, parce
-- que c'est le nom qu'appelle NOTRE `m365-login-callback`. Un nom différent
-- ne casserait rien au déploiement : la connexion échouerait en
-- « secret_illisible », sans dire pourquoi.
--
-- DROITS (AGENTS.md §4 bis) : les privilèges par défaut du projet Supabase
-- donnent `execute` à PUBLIC, `anon`, `authenticated` et `service_role` sur
-- toute fonction créée, et `all` sur toute table. Chaque objet ci-dessous
-- porte donc ses `revoke` NOMMÉS : `revoke … from public` ne retire PAS le
-- droit d'`anon`, qui est un grant nominatif.
--
-- REJOUABLE : `if not exists`, `drop … if exists` avant `create`,
-- `create or replace` pour les fonctions. Aucune donnée supposée.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 0. Fonctions utilitaires partagées par tout le schéma.
-- ─────────────────────────────────────────────────────────────────────

-- `updated_at` ne bouge QUE si la ligne change vraiment. Pourquoi : un
-- import relit chaque nuit des milliers de lignes identiques ; si chaque
-- relecture touchait `updated_at`, le flux `api_v1.changements` enverrait
-- tout, chaque nuit, à chaque lecteur. La comparaison se fait sur la ligne
-- entière moins `updated_at`.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'updated_at') is not distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Déclencheur BEFORE UPDATE : pose updated_at = now() si une colonne autre '
  'que updated_at change, garde l''ancienne valeur sinon. Une mise à jour '
  'sans changement ne doit pas apparaître comme un changement.';

-- Refus générique d'une écriture. Sert aux tables en ajout seul (audit,
-- historiques) et à l'interdiction de suppression physique (séances,
-- affectations, attributions de rôle). Pourquoi un déclencheur et pas
-- seulement un `revoke` : le propriétaire des tables (`postgres`) et toute
-- migration future gardent les droits ; seul un déclencheur les arrête,
-- et il le fait avec un message qui dit quoi faire à la place.
create or replace function public.refuser_ecriture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% sur public.% refusé : %',
    tg_op, tg_table_name,
    coalesce(tg_argv[0], 'table protégée')
    using errcode = 'P0001';
end;
$$;

comment on function public.refuser_ecriture() is
  'Déclencheur de refus : lève une exception avec le motif passé en argument. '
  'Utilisé pour l''ajout seul (audit, historiques) et l''interdiction de '
  'suppression physique.';

revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon;
revoke all on function public.set_updated_at() from authenticated;
revoke all on function public.refuser_ecriture() from public;
revoke all on function public.refuser_ecriture() from anon;
revoke all on function public.refuser_ecriture() from authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 1. profiles — projection de auth.users, alimentée par déclencheur.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  -- Lu par `m365-login-callback` (lireProfil) ET par `a_role()` : un compte
  -- désactivé perd la connexion SSO et tous ses droits de lecture d'un
  -- seul geste, sans toucher à ses attributions de rôle (qui restent la
  -- trace de ce qui a été accordé).
  is_active boolean not null default true,
  -- Écrit par `m365-login-callback` (marquerProfilSso). Marque les comptes
  -- qui se sont CONNECTÉS par Microsoft, pas ceux CRÉÉS par lui : ne
  -- jamais s'en servir comme borne d'une désactivation automatique.
  sso_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil applicatif d''un compte auth.users. Créé par le déclencheur '
  'on_auth_user_created. Écritures par Edge Functions (service_role) '
  'uniquement.';

alter table public.profiles enable row level security;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Lecture de son propre profil. La lecture des autres profils par
-- l'administrateur est posée dans 20261120090100, après `a_role()`.
drop policy if exists profiles_select_soi on public.profiles;
create policy profiles_select_soi
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Aucune politique d'écriture, et aucun droit d'écriture : le front ne
-- modifie jamais un profil. `is_active` modifiable par l'intéressé serait
-- une auto-réactivation.
revoke all on table public.profiles from anon, authenticated;
-- service_role : droits accordés NOMMÉMENT. Les Edge Functions écrivent
-- sous ce rôle ; s'en remettre aux privilèges par défaut du projet, qui
-- peuvent différer d'une image à l'autre, ferait échouer l'import en
-- production sans que rien ne le signale ici. 20261120090700 le vérifie.
-- (lireProfil, marquerProfilSso de m365-login-callback.)
grant select, insert, update on table public.profiles to service_role;
grant select on table public.profiles to authenticated;

-- Déclencheur sur auth.users. `on conflict do nothing` le rend rejouable
-- et sans effet si le profil existe déjà.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- Pas de `drop trigger` ici : sur `auth.users`, le supprimer exige d'être
-- PROPRIÉTAIRE de la table, ce que `postgres` n'est pas forcément sur
-- Supabase (le créer ne demande que le droit TRIGGER). On crée donc
-- seulement s'il manque, et on lève s'il existe sous ce nom en appelant
-- une AUTRE fonction : l'ignorer laisserait des comptes sans profil.
do $$
declare
  v_fonction oid;
begin
  select t.tgfoid into v_fonction
    from pg_trigger t
   where t.tgrelid = 'auth.users'::regclass
     and t.tgname = 'on_auth_user_created';
  if v_fonction is null then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  elsif v_fonction <> 'public.handle_new_user()'::regprocedure then
    raise exception 'auth.users porte déjà un déclencheur on_auth_user_created vers %, pas vers public.handle_new_user()',
      v_fonction::regprocedure;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. m365_tenants — configuration d'un locataire Microsoft Entra ID.
--
--    LA CLÉ SECRÈTE N'EST JAMAIS DANS CETTE TABLE. Elle vit dans Vault
--    sous le nom `m365_client_secret_<id de ligne>`. La table ne porte que
--    les drapeaux dérivés `secret_is_set` / `secret_updated_at`, que
--    l'outil qui pose le secret doit tenir à jour.
--
--    DÉFAUTS FAIL-CLOSED, à ne pas « simplifier » :
--      * `purpose` DEFAULT '{login}' — retirer `login` coupe le SSO du
--        locataire (coupe-circuit) ;
--      * `email_domains` DEFAULT '{}' — vide, AUCUN SSO n'est possible.
--        La vider est le geste d'urgence (PREREQUIS-m365-auth §3).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.m365_tenants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null
    check (char_length(display_name) between 1 and 120),
  tenant_id uuid not null,
  client_id uuid not null,
  purpose text[] not null default '{login}',
  email_domains text[] not null default '{}',
  secret_is_set boolean not null default false,
  secret_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint m365_tenants_tenant_id_unique unique (tenant_id)
);

comment on table public.m365_tenants is
  'Locataires Microsoft 365 (Entra ID) raccordés au SSO. Clé secrète en '
  'Vault (m365_client_secret_<id>), jamais ici. Aucun accès client : '
  'lecture et écriture par Edge Functions en service_role, aiguillage de '
  'l''écran de connexion par la RPC m365_tenant_for_email.';

comment on column public.m365_tenants.email_domains is
  'Liste blanche des domaines autorisés au SSO sur ce locataire, comparée '
  'sans casse. Vide par défaut : aucun SSO (fail-closed). La vider referme '
  'le SSO du locataire : c''est le geste d''urgence.';

alter table public.m365_tenants enable row level security;

drop trigger if exists trg_m365_tenants_set_updated_at on public.m365_tenants;
create trigger trg_m365_tenants_set_updated_at
  before update on public.m365_tenants
  for each row execute function public.set_updated_at();

-- RLS ACTIVÉE ET AUCUNE POLITIQUE : VERROU DÉLIBÉRÉ. Aucun rôle client ne
-- lit ni n'écrit cette table, administrateur compris. Le lot 1 n'a pas
-- d'écran de réglage du SSO ; le jour où il en aura un, il passera par une
-- Edge Function. L'écran de connexion n'en a pas besoin : il passe par la
-- RPC du §3, qui ne rend que trois identifiants publics.
revoke all on table public.m365_tenants from anon, authenticated;
-- service_role : lecture par l'Edge de rappel, écriture par l'outil qui
-- pose le secret (`secret_is_set`).
grant select, insert, update on table public.m365_tenants to service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC d'aiguillage — « cette adresse passe-t-elle par Microsoft ? »
--
--    Exécutable par `anon` : la question se pose AVANT toute session.
--    C'est la SEULE fonction de `public` exécutable par `anon`, et
--    l'assertion de 20261120090700 la nomme comme exception.
--
--    Trois gardes, toutes en base : domaine déclaré ET clé posée ET
--    `login` dans `purpose`. Elle dit si un DOMAINE est raccordé, jamais si
--    un COMPTE existe : sinon l'écran de connexion serait un oracle
--    d'énumération des comptes.
--
--    ORDRE TOTAL (`order by created_at, id`) : `id` tranche l'égalité de
--    `now()` entre deux lignes créées dans la même transaction. Sans lui,
--    le locataire rendu serait non déterministe.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.m365_tenant_for_email(p_email text)
returns table (
  tenant_row_id uuid,
  tenant_id uuid,
  client_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.tenant_id, t.client_id
    from public.m365_tenants t
   where 'login' = any (t.purpose)
     and t.secret_is_set
     and p_email is not null
     and position('@' in p_email) > 0
     and lower(split_part(p_email, '@', 2)) = any (
       select lower(d) from unnest(t.email_domains) d
     )
   order by t.created_at, t.id
   limit 1;
$$;

revoke all on function public.m365_tenant_for_email(text) from public;
revoke all on function public.m365_tenant_for_email(text) from anon;
grant execute on function public.m365_tenant_for_email(text) to anon;
grant execute on function public.m365_tenant_for_email(text) to authenticated;

comment on function public.m365_tenant_for_email(text) is
  'Rend (tenant_row_id, tenant_id, client_id) du locataire Microsoft 365 '
  'autorisé pour le domaine de l''adresse, ou aucune ligne. Filtres : login '
  'dans purpose, secret_is_set, domaine dans email_domains (sans casse). '
  'Exécutable par anon (écran de connexion, avant toute session) : seule '
  'exception à la règle « anon n''exécute rien dans public ».';

-- ─────────────────────────────────────────────────────────────────────
-- 4. RPC de lecture du secret — service_role SEUL.
--
--    plpgsql et non sql : le corps n'est résolu qu'à l'exécution, donc la
--    migration passe même sur une base où Vault n'est pas encore chargé
--    (base jetable du runner). Un appel sans Vault lève, et l'Edge
--    retombe en « secret_illisible » — fail-closed.
--
--    Le `revoke` nommé à `authenticated` est la pièce qui compte : sans
--    lui, les privilèges par défaut donneraient la clé Entra à toute
--    session ouverte.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.m365_tenant_secret(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_id is null then
    return null;
  end if;
  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s
   where s.name = 'm365_client_secret_' || p_id::text;
  return v_secret;
end;
$$;

revoke all on function public.m365_tenant_secret(uuid) from public;
revoke all on function public.m365_tenant_secret(uuid) from anon;
revoke all on function public.m365_tenant_secret(uuid) from authenticated;
grant execute on function public.m365_tenant_secret(uuid) to service_role;

comment on function public.m365_tenant_secret(uuid) is
  'Rend la clé secrète Entra du locataire p_id, lue en Vault sous le nom '
  'm365_client_secret_<p_id>, ou NULL. service_role seul (Edge '
  'm365-login-callback). Nom imposé par le code vendorisé.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. find_auth_user_by_email — service_role SEUL.
--
--    Au retour OAuth, la question est « ce compte existe-t-il déjà côté
--    authentification ? ». `auth.users` est la seule source qui y réponde
--    (`profiles` est une projection qui peut manquer une ligne), et le
--    schéma `auth` n'est pas exposé à PostgREST : d'où cette porte
--    étroite. Une adresse entre, un uuid ou NULL sort — aucune autre
--    colonne d'auth.users.
--
--    `lower()` des deux côtés : Microsoft rend l'adresse dans la casse
--    de l'annuaire (`Prenom.Nom@…`). Sans lui, chaque connexion SSO
--    chercherait un compte qu'elle ne trouverait pas.
--
--    Ouverte à `authenticated`, elle serait un oracle d'existence de
--    compte, interrogeable adresse par adresse.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.find_auth_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where lower(u.email) = lower(p_email)
   order by u.created_at, u.id
   limit 1;
$$;

revoke all on function public.find_auth_user_by_email(text) from public;
revoke all on function public.find_auth_user_by_email(text) from anon;
revoke all on function public.find_auth_user_by_email(text) from authenticated;
grant execute on function public.find_auth_user_by_email(text) to service_role;

comment on function public.find_auth_user_by_email(text) is
  'SSO M365 : uuid auth.users pour une adresse (sans casse), NULL sinon. '
  'service_role seul — c''est un oracle d''existence de compte.';

-- ─────────────────────────────────────────────────────────────────────
-- 6. audit_log — journal des actions, en ajout seul.
--
--    Écrit par `ecrireAudit` (edge-kit) en service_role, avec l'acteur
--    RÉEL (jamais le service). Le CHECK admet les HUIT valeurs du type
--    `ActionAudit` : une valeur refusée ne lève rien côté Edge
--    (`ecrireAudit` ne lève jamais), la trace disparaît EN SILENCE.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_log_action_check check (action in (
    'insert', 'update', 'delete',
    'login', 'logout', 'grant', 'revoke', 'invite'
  ))
);

comment on table public.audit_log is
  'Journal des actions (ajout seul). Écrit par les Edge Functions avec '
  'l''acteur réel. Lu par l''administrateur du Planning (« Historique des '
  'actions »).';

create index if not exists audit_log_table_name_idx on public.audit_log (table_name);
create index if not exists audit_log_actor_id_idx on public.audit_log (actor_id);
create index if not exists audit_log_occurred_at_idx on public.audit_log (occurred_at desc);

-- Une trace `login` par SESSION GoTrue, pas par évènement d'auth. Sans
-- cet index, chaque rafraîchissement de jeton (~horaire) produit une
-- ligne de plus, et `identifiantSessionDuJwt` est calculé pour rien :
-- c'est l'index qui refuse le doublon, la garde `23505` d'`ecrireAudit`
-- ne fait que taire le refus. Seule une contrainte tranche une course
-- entre deux appels concurrents. Partiel : aucune autre trace touchée.
-- Repris d'APP-MSP (0007).
create unique index if not exists audit_log_login_une_par_session
  on public.audit_log ((after ->> 'session_id'))
  where action = 'login' and after ? 'session_id';

alter table public.audit_log enable row level security;

-- Ajout seul : une trace d'audit corrigeable n'est plus une trace.
drop trigger if exists trg_audit_log_ajout_seul on public.audit_log;
create trigger trg_audit_log_ajout_seul
  before update or delete on public.audit_log
  for each row execute function public.refuser_ecriture('journal d''audit en ajout seul');

drop trigger if exists trg_audit_log_ajout_seul_truncate on public.audit_log;
create trigger trg_audit_log_ajout_seul_truncate
  before truncate on public.audit_log
  for each statement execute function public.refuser_ecriture('journal d''audit en ajout seul');

-- service_role garde `insert` (ecrireAudit). Les clients n'ont que la
-- lecture, bornée par la politique posée dans 20261120090100.
revoke all on table public.audit_log from anon, authenticated;
revoke update, delete, truncate on table public.audit_log from service_role;
grant select, insert on table public.audit_log to service_role;
grant select on table public.audit_log to authenticated;
