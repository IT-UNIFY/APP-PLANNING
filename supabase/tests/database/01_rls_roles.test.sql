-- =====================================================================
-- 01_rls_roles.test.sql — RLS par rôle (lot 1).
--
-- Pour chaque règle, au moins un cas qui AUTORISE et un cas qui REFUSE :
-- un test qui ne vérifie que le refus passe aussi quand tout est fermé
-- par erreur.
--
-- Impersonation : `set local role` + `request.jwt.claims` (lu par
-- auth.uid()). Tout est annulé par le `rollback` final.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- La répétition doit tourner SANS superutilisateur, comme en production :
-- un superutilisateur passe outre les droits, et des tests de refus
-- verts ne prouveraient alors rien.
select ok(not (select rolsuper from pg_roles where rolname = current_user),
  'les tests tournent sans superutilisateur (comme en production)');

-- ── Jeu de données ───────────────────────────────────────────────────
-- a1 admin · l1 lecteur · n1 sans rôle · r1 lecteur révoqué · i1 admin
-- au profil désactivé.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@epss.test'),
  ('22222222-2222-2222-2222-222222222222', 'lecteur@epss.test'),
  ('33333333-3333-3333-3333-333333333333', 'sansrole@epss.test'),
  ('44444444-4444-4444-4444-444444444444', 'revoque@epss.test'),
  ('55555555-5555-5555-5555-555555555555', 'inactif@epss.test');

update public.profiles set is_active = false
 where id = '55555555-5555-5555-5555-555555555555';

insert into public.user_roles (user_id, role_code, accorde_le, revoque_le) values
  ('11111111-1111-1111-1111-111111111111', 'admin_planning', now(), null),
  ('22222222-2222-2222-2222-222222222222', 'lecteur_interventions', now(), null),
  ('44444444-4444-4444-4444-444444444444', 'lecteur_interventions', now() - interval '1 day', now()),
  ('55555555-5555-5555-5555-555555555555', 'admin_planning', now(), null);

insert into public.imports_aurion (id, declenchement, statut, fin)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'automatique', 'reussi_avec_anomalies', now());

insert into public.intervenants_aurion (aurion_individu_id, nom_affiche)
values ('IND-1', 'Intervenant Un');

insert into public.interventions (id, aurion_seance_id, debut, fin, cours_intitule, dernier_import_id)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'SEANCE-1',
        '2027-01-07 09:00+01', '2027-01-07 12:00+01', 'Droit de la famille',
        'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.affectations (id, intervention_id, aurion_individu_id, aurion_intervention_id)
values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'IND-1', 'ITV-AUR-1');

insert into public.anomalies_import (import_id, intervention_id, aurion_seance_id, type)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'SEANCE-1', 'salle_inconnue');

insert into public.audit_log (actor_id, action, table_name, row_id)
values ('11111111-1111-1111-1111-111111111111', 'grant', 'public.user_roles', 'x');

insert into public.m365_tenants (id, display_name, tenant_id, client_id, email_domains, secret_is_set)
values ('dddddddd-0000-0000-0000-000000000001', 'EPSS',
        'dddddddd-0000-0000-0000-0000000000aa', 'dddddddd-0000-0000-0000-0000000000bb',
        '{epss.test}', true);

-- ── Administrateur du Planning ───────────────────────────────────────
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.interventions), 1, 'admin : lit les séances');
select is((select count(*)::int from public.affectations), 1, 'admin : lit les affectations');
select is((select count(*)::int from public.anomalies_import), 1, 'admin : lit les anomalies d''import');
select is((select count(*)::int from public.user_roles), 4, 'admin : lit les attributions des autres');
select is((select count(*)::int from public.profiles), 5, 'admin : lit tous les profils');
select is((select count(*)::int from public.audit_log), 1, 'admin : lit le journal d''audit');
select is((select count(*)::int from public.intervenants_aurion), 1, 'admin : lit les intervenants');
select throws_ok(
  $$ select count(*) from public.m365_tenants $$,
  '42501', null, 'admin : m365_tenants reste fermé (verrou délibéré)');
select throws_ok(
  $$ update public.interventions set cours_intitule = 'x' $$,
  '42501', null, 'admin : aucune écriture directe (Edge Functions seulement)');

reset role;

-- ── Lecteur des interventions ────────────────────────────────────────
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.interventions), 1, 'lecteur : lit les séances');
select is((select count(*)::int from public.affectations_historique), 1, 'lecteur : lit l''historique');
select is((select count(*)::int from public.imports_aurion), 1, 'lecteur : lit le journal des imports');
select is((select count(*)::int from public.anomalies_import), 0, 'lecteur : ne lit PAS les anomalies');
select is((select count(*)::int from public.user_roles), 1, 'lecteur : ne lit que ses propres attributions');
select is((select count(*)::int from public.profiles), 1, 'lecteur : ne lit que son propre profil');
select is((select count(*)::int from public.audit_log), 0, 'lecteur : ne lit PAS le journal d''audit');
select throws_ok(
  $$ insert into public.interventions (debut, fin) values (now(), now() + interval '1 hour') $$,
  '42501', null, 'lecteur : ne peut pas créer de séance');
select throws_ok(
  $$ select public.m365_tenant_secret('dddddddd-0000-0000-0000-000000000001') $$,
  '42501', null, 'authenticated : ne lit pas la clé Entra');
select throws_ok(
  $$ select public.find_auth_user_by_email('admin@epss.test') $$,
  '42501', null, 'authenticated : pas d''oracle d''existence de compte');

reset role;

-- ── Sans rôle, rôle révoqué, profil désactivé : refus ────────────────
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.interventions), 0, 'sans rôle : aucune séance');
reset role;

set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.interventions), 0, 'rôle révoqué : aucune séance');
reset role;

set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.anomalies_import), 0, 'profil désactivé : le rôle admin ne vaut plus');
reset role;

-- ── anon : rien, sauf l'aiguillage M365 ──────────────────────────────
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select throws_ok(
  $$ select count(*) from public.interventions $$,
  '42501', null, 'anon : aucune lecture des séances');
select throws_ok(
  $$ select public.a_role('admin_planning') $$,
  '42501', null, 'anon : a_role() non exécutable');
select is(
  (select tenant_row_id from public.m365_tenant_for_email('Prenom.Nom@EPSS.test')),
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  'anon : aiguillage M365 pour un domaine déclaré (casse ignorée)');
select is(
  (select count(*)::int from public.m365_tenant_for_email('quelquun@ailleurs.test')),
  0, 'anon : aucun aiguillage pour un domaine non déclaré');
reset role;

-- ── Retrait d'un rôle : jamais une suppression ───────────────────────
select throws_ok(
  $$ delete from public.user_roles where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'P0001', null, 'user_roles : la suppression est refusée (retrait = revoque_le)');

select * from finish();
rollback;
