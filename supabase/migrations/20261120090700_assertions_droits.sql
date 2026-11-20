-- =====================================================================
-- 20261120090700_assertions_droits.sql — APP-PLANNING, lot 1
--
-- Assertions sur l'état EFFECTIF des droits, après les sept migrations
-- du lot. Ce fichier ne crée rien : il LÈVE, et fait échouer le
-- déploiement, si l'état n'est pas celui que les fichiers précédents
-- croient avoir posé.
--
-- POURQUOI UNE MIGRATION ET PAS SEULEMENT UN TEST : les privilèges par
-- défaut du projet Supabase AJOUTENT des droits à chaque `create`, sans
-- erreur ni avertissement (AGENTS.md §4 bis). Un `revoke` oublié ne se
-- voit pas. Les tests pgTAP le voient sur la base jetable ; ce bloc le
-- voit sur la base RÉELLE, au moment du déploiement, et y arrête tout
-- avant que la surface élargie soit en service.
--
-- On lit les droits EFFECTIFS (`has_*_privilege`), pas les `grant`
-- déclarés : un droit hérité de PUBLIC compte autant qu'un droit nominatif.
--
-- Deux sens : les points 1 à 6 vérifient des REFUS (surface trop large),
-- les points 7 à 9 des DROITS ATTENDUS pour `service_role` (surface trop
-- étroite : un import qui échouerait en production).
--
-- Rejouable : lecture seule.
-- =====================================================================

do $$
declare
  v_liste text;
begin
  -- 1. Toute table de `public` a la RLS activée.
  select string_agg(c.relname, ', ' order by c.relname) into v_liste
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and not c.relrowsecurity;
  if v_liste is not null then
    raise exception 'Assertion : tables de public sans RLS : %', v_liste;
  end if;

  -- 2. `anon` n'exécute aucune fonction de `public`, sauf l'aiguillage
  --    M365 qui sert l'écran de connexion AVANT toute session. Les
  --    fonctions d'extension sont exclues : elles ne sont pas à nous.
  --
  --    Les fonctions qui renvoient `trigger` ou `event_trigger` sont exclues
  --    aussi : Postgres refuse de les appeler hors d'un déclencheur, donc ni
  --    PostgREST ni un client ne peut les exécuter, quel que soit le droit
  --    `execute`. Mesuré le 2026-11-20 au premier apply (run 44720952788) :
  --    le projet hébergé porte `public.rls_auto_enable()`, fonction de
  --    Supabase (propriétaire `postgres`, déclencheur d'événement
  --    `ensure_rls`, qui active la RLS des nouvelles tables), exécutable par
  --    `anon`. Elle n'existe pas dans l'image de la répétition : c'est elle
  --    qui a arrêté cette assertion en prod, alors que la répétition passait.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_liste
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
     and p.oid <> 'public.m365_tenant_for_email(text)'::regprocedure
     and not exists (
       select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
     )
     and has_function_privilege('anon', p.oid, 'execute');
  if v_liste is not null then
    raise exception 'Assertion : anon peut exécuter dans public : %', v_liste;
  end if;

  -- 2 bis. Les deux RPC du secret et de l'oracle de comptes restent
  --        fermées à `authenticated` : ouvertes, elles donneraient la clé
  --        Entra et l'existence des comptes à toute session.
  if has_function_privilege('authenticated', 'public.m365_tenant_secret(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.find_auth_user_by_email(text)', 'execute') then
    raise exception 'Assertion : authenticated peut exécuter m365_tenant_secret ou find_auth_user_by_email';
  end if;

  -- 3. `anon` et `authenticated` n'ont aucun droit sur `api_v1` : le
  --    contrat est servi par l'identité technique, jamais au navigateur.
  if has_schema_privilege('anon', 'api_v1', 'usage')
     or has_schema_privilege('authenticated', 'api_v1', 'usage') then
    raise exception 'Assertion : anon ou authenticated a usage sur api_v1';
  end if;

  select string_agg(r.rolname || ' → ' || c.relname, ', ') into v_liste
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r (rolname)
   where n.nspname = 'api_v1'
     and has_table_privilege(r.rolname, c.oid,
           'select, insert, update, delete, truncate, references, trigger');
  if v_liste is not null then
    raise exception 'Assertion : droits sur api_v1 : %', v_liste;
  end if;

  -- 3 bis. Toute vue de `api_v1` est `security_invoker` : une vue
  --        ordinaire s'exécuterait avec les droits de son propriétaire et
  --        contournerait la RLS des tables sources.
  select string_agg(c.relname, ', ' order by c.relname) into v_liste
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'api_v1'
     and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  if v_liste is not null then
    raise exception 'Assertion : vues de api_v1 sans security_invoker : %', v_liste;
  end if;

  -- 4. Aucune table d'historique n'accepte d'écriture d'un rôle d'API,
  --    service_role compris : seule la fonction de déclencheur insère.
  select string_agg(r.rolname || ' → ' || t.nom, ', ') into v_liste
    from (values ('public.interventions_historique'), ('public.affectations_historique')) as t (nom)
    cross join (values ('anon'), ('authenticated'), ('service_role'), ('lecteur_gdc')) as r (rolname)
   where has_table_privilege(r.rolname, t.nom::regclass, 'insert, update, delete, truncate')
      or has_any_column_privilege(r.rolname, t.nom::regclass, 'insert, update');
  if v_liste is not null then
    raise exception 'Assertion : écriture possible sur un historique : %', v_liste;
  end if;

  -- 4 bis. Pas de suppression physique, même pour service_role : séances,
  --        affectations et attributions de rôle se retirent par un statut
  --        ou une date. Le déclencheur arrête DELETE ; seul le droit
  --        arrête TRUNCATE.
  select string_agg(t.nom, ', ') into v_liste
    from (values ('public.interventions'), ('public.affectations'), ('public.user_roles')) as t (nom)
   where has_table_privilege('service_role', t.nom::regclass, 'delete, truncate');
  if v_liste is not null then
    raise exception 'Assertion : service_role peut supprimer dans : %', v_liste;
  end if;

  -- 5. `anon` et `authenticated` n'écrivent nulle part dans `public` :
  --    toutes les écritures passent par les Edge Functions.
  select string_agg(r.rolname || ' → ' || c.relname, ', ' order by c.relname) into v_liste
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r (rolname)
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and (has_table_privilege(r.rolname, c.oid, 'insert, update, delete, truncate')
          or has_any_column_privilege(r.rolname, c.oid, 'insert, update'));
  if v_liste is not null then
    raise exception 'Assertion : écriture client possible dans public : %', v_liste;
  end if;

  -- 6. `anon` ne lit rien dans `public` : aucun écran n'est servi avant
  --    connexion, hors l'aiguillage M365 (fonction, point 2).
  select string_agg(c.relname, ', ' order by c.relname) into v_liste
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and has_any_column_privilege('anon', c.oid, 'select');
  if v_liste is not null then
    raise exception 'Assertion : anon peut lire dans public : %', v_liste;
  end if;

  -- ─────────────────────────────────────────────────────────────────
  -- ASSERTIONS POSITIVES — ce que `service_role` DOIT pouvoir faire.
  --
  -- Les points 1 à 6 ne vérifient que des refus : un schéma entièrement
  -- fermé les passerait tous, et l'import échouerait en production sur
  -- un `42501`. Les droits ci-dessous sont accordés nommément dans le
  -- fichier qui crée chaque objet ; ce bloc prouve qu'ils sont effectifs
  -- sur la base réelle, quels que soient ses privilèges par défaut.
  -- Chaque droit est testé SEUL : `has_table_privilege(…, 'insert,
  -- update')` est vrai dès que l'UN des deux est accordé.
  -- ─────────────────────────────────────────────────────────────────

  -- 7. Sans BYPASSRLS, aucune écriture des Edge Functions ne passerait :
  --    aucune table n'a de politique d'écriture.
  if not coalesce((select rolbypassrls from pg_roles where rolname = 'service_role'), false) then
    raise exception 'Assertion : service_role n''a pas BYPASSRLS';
  end if;

  if not has_schema_privilege('service_role', 'public', 'usage') then
    raise exception 'Assertion : service_role n''a pas usage sur public';
  end if;

  -- 8. Fonctions : les deux RPC de l'Edge de rappel M365, et les fonctions
  --    appelées par les déclencheurs BEFORE (non definer, donc exécutées
  --    avec les droits de l'écrivain).
  select string_agg(f.sig, ', ') into v_liste
    from (values
      ('public.m365_tenant_secret(uuid)'),
      ('public.find_auth_user_by_email(text)'),
      ('public.interventions_suivi_change(public.interventions,public.interventions)'),
      ('public.affectations_suivi_change(public.affectations,public.affectations)')
    ) as f (sig)
   where not has_function_privilege('service_role', f.sig::regprocedure, 'execute');
  if v_liste is not null then
    raise exception 'Assertion : service_role ne peut pas exécuter : %', v_liste;
  end if;

  -- 9. Tables : chaque (table, droit) attendu.
  select string_agg(d.tbl || ' (' || d.droit || ')', ', ') into v_liste
    from (values
      ('public.profiles', 'select'), ('public.profiles', 'update'),
      ('public.m365_tenants', 'select'), ('public.m365_tenants', 'update'),
      ('public.audit_log', 'insert'),
      ('public.user_roles', 'select'), ('public.user_roles', 'insert'), ('public.user_roles', 'update'),
      ('public.promotions_groupes', 'select'), ('public.promotions_groupes', 'insert'), ('public.promotions_groupes', 'update'),
      ('public.salles', 'select'), ('public.salles', 'insert'), ('public.salles', 'update'),
      ('public.intervenants_aurion', 'select'), ('public.intervenants_aurion', 'insert'), ('public.intervenants_aurion', 'update'),
      ('public.imports_aurion', 'select'), ('public.imports_aurion', 'insert'), ('public.imports_aurion', 'update'),
      ('public.anomalies_import', 'select'), ('public.anomalies_import', 'insert'), ('public.anomalies_import', 'update'),
      ('public.interventions', 'select'), ('public.interventions', 'insert'), ('public.interventions', 'update'),
      ('public.affectations', 'select'), ('public.affectations', 'insert'), ('public.affectations', 'update'),
      ('public.intervention_groupes', 'select'), ('public.intervention_groupes', 'insert'),
      ('public.intervention_groupes', 'update'), ('public.intervention_groupes', 'delete')
    ) as d (tbl, droit)
   where not has_table_privilege('service_role', d.tbl::regclass, d.droit);
  if v_liste is not null then
    raise exception 'Assertion : droits manquants pour service_role : %', v_liste;
  end if;
end;
$$;
