-- =====================================================================
-- 03_droits.test.sql — droits effectifs (AGENTS.md §4 bis).
--
-- Les privilèges par défaut de Supabase donnent `execute` à PUBLIC,
-- anon, authenticated et service_role sur toute fonction créée, et `all`
-- sur toute table. Ces tests lisent l'état EFFECTIF (`has_*_privilege`),
-- pas les `grant` écrits : c'est le seul moyen de voir un droit posé
-- d'office. Même contrôle que 20261120090700, rejoué ici à chaque test.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- ── Fonctions ────────────────────────────────────────────────────────
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid <> 'public.m365_tenant_for_email(text)'::regprocedure
        and not exists (select 1 from pg_depend d
                         where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
        and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon n''exécute aucune fonction de public, hors aiguillage M365');

select ok(has_function_privilege('anon', 'public.m365_tenant_for_email(text)', 'execute'),
  'anon exécute l''aiguillage M365 (écran de connexion, avant session)');
select ok(has_function_privilege('authenticated', 'public.a_role(text)', 'execute'),
  'authenticated exécute a_role() (allow)');
select ok(not has_function_privilege('anon', 'public.a_role(text)', 'execute'),
  'anon n''exécute pas a_role() (deny)');
select ok(not has_function_privilege('authenticated', 'public.m365_tenant_secret(uuid)', 'execute'),
  'authenticated n''exécute pas m365_tenant_secret()');
select ok(not has_function_privilege('authenticated', 'public.find_auth_user_by_email(text)', 'execute'),
  'authenticated n''exécute pas find_auth_user_by_email()');
select ok(has_function_privilege('service_role', 'public.m365_tenant_secret(uuid)', 'execute'),
  'service_role exécute m365_tenant_secret() (Edge de rappel M365)');

-- ── Tables de public ─────────────────────────────────────────────────
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'toute table de public a la RLS activée');

select is_empty(
  $$ select r.rolname, c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r (rolname)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and (has_table_privilege(r.rolname, c.oid, 'insert, update, delete, truncate')
             or has_any_column_privilege(r.rolname, c.oid, 'insert, update')) $$,
  'anon et authenticated n''écrivent nulle part dans public');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and has_any_column_privilege('anon', c.oid, 'select') $$,
  'anon ne lit rien dans public');

select ok(has_table_privilege('authenticated', 'public.interventions', 'select'),
  'authenticated lit public.interventions (borné par la RLS)');

select is_empty(
  $$ select r.rolname, t.nom
       from (values ('public.interventions_historique'), ('public.affectations_historique')) t (nom)
      cross join (values ('anon'), ('authenticated'), ('service_role'), ('lecteur_gdc')) r (rolname)
      where has_table_privilege(r.rolname, t.nom::regclass, 'insert, update, delete, truncate')
         or has_any_column_privilege(r.rolname, t.nom::regclass, 'insert, update') $$,
  'aucun rôle d''API n''écrit dans un historique, service_role compris');

-- ── api_v1 ───────────────────────────────────────────────────────────
select ok(not has_schema_privilege('anon', 'api_v1', 'usage')
          and not has_schema_privilege('authenticated', 'api_v1', 'usage'),
  'anon et authenticated n''ont pas usage sur api_v1');
select ok(has_schema_privilege('lecteur_gdc', 'api_v1', 'usage'),
  'lecteur_gdc a usage sur api_v1');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'api_v1' and c.relkind = 'v'
        and not coalesce(c.reloptions @> array['security_invoker=true'], false) $$,
  'toute vue de api_v1 est security_invoker');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'api_v1' and c.relkind = 'v'
        and obj_description(c.oid, 'pg_class') is null $$,
  'toute vue de api_v1 porte un comment on view');

-- ── Le rôle technique ────────────────────────────────────────────────
select ok(
  (select not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls
     from pg_roles where rolname = 'lecteur_gdc'),
  'lecteur_gdc : NOLOGIN, NOINHERIT, ni superutilisateur ni BYPASSRLS');
select ok(pg_has_role('authenticator', 'lecteur_gdc', 'member'),
  'authenticator peut basculer en lecteur_gdc (PostgREST)');

select * from finish();
rollback;
