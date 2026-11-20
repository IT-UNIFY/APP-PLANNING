-- =====================================================================
-- 20261120090200_referentiels_aurion.sql — APP-PLANNING, lot 1
--
-- Référentiels repris d'Aurion « tels quels » : promotions et groupes,
-- salles, intervenants (identifiant + nom affiché).
--
-- Le carnet (Lot 1) : « Reprendre seulement les données qui existent déjà
-- dans Aurion, sans construction : ni arborescence des groupes, ni
-- catalogue, ni capacité des salles. » D'où des tables plates, sans
-- parent, sans capacité. La hiérarchie des groupes est une question
-- ouverte du carnet (ADR-001, « Avant d'accepter » §3).
--
-- Écritures : Edge Function d'import, en service_role. Aucun client
-- n'écrit (revoke ci-dessous, aucune politique d'écriture).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. promotions_groupes — promotions et groupes ensemble (le carnet les
--    affiche ensemble), sans arborescence.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.promotions_groupes (
  id uuid primary key default gen_random_uuid(),
  -- Ancien code Aurion : la clé de rapprochement d'un import à l'autre.
  aurion_code text not null unique,
  intitule text,
  -- NULL tant qu'Aurion ne dit pas la nature : on ne la déduit pas.
  nature text check (nature in ('promotion', 'groupe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.promotions_groupes is
  'Promotions et groupes tels que dans Aurion (code, intitulé), sans '
  'arborescence. Clé de rapprochement : aurion_code.';

alter table public.promotions_groupes enable row level security;

drop trigger if exists trg_promotions_groupes_set_updated_at on public.promotions_groupes;
create trigger trg_promotions_groupes_set_updated_at
  before update on public.promotions_groupes
  for each row execute function public.set_updated_at();

drop policy if exists promotions_groupes_select on public.promotions_groupes;
create policy promotions_groupes_select
  on public.promotions_groupes for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

revoke all on table public.promotions_groupes from anon, authenticated;
-- service_role : droits accordés NOMMÉMENT. Les Edge Functions écrivent
-- sous ce rôle ; s'en remettre aux privilèges par défaut du projet, qui
-- peuvent différer d'une image à l'autre, ferait échouer l'import en
-- production sans que rien ne le signale ici. 20261120090700 le vérifie.
grant select, insert, update on table public.promotions_groupes to service_role;
grant select on table public.promotions_groupes to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. salles — construites depuis les séances (Q6) : Aurion ne donne
--    qu'un nom et un site. Une salle inconnue reste en texte brut sur la
--    séance (`interventions.salle_nom_aurion`) et lève une anomalie.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.salles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  site text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.salles is
  'Salles telles que nommées dans Aurion (nom, site), construites depuis '
  'les séances importées. Sans capacité au lot 1.';

alter table public.salles enable row level security;

drop trigger if exists trg_salles_set_updated_at on public.salles;
create trigger trg_salles_set_updated_at
  before update on public.salles
  for each row execute function public.set_updated_at();

drop policy if exists salles_select on public.salles;
create policy salles_select
  on public.salles for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

revoke all on table public.salles from anon, authenticated;
grant select, insert, update on table public.salles to service_role;
grant select on table public.salles to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. intervenants_aurion — l'identifiant de la fiche individu Aurion et
--    le nom affiché, RIEN D'AUTRE.
--
--    La personne appartient à l'outil Intervenant (ADR-001 D1). Le
--    Planning ne garde que ce qu'il faut pour afficher la liste des
--    interventions sans appeler GDC à chaque ligne (Q5). Aucune autre
--    donnée personnelle ici — pas d'adresse, pas de statut, pas de
--    tarif — et le nom n'est PAS exposé dans `api_v1` : le lecteur
--    (GDC) a déjà la personne chez lui.
--
--    `aurion_individu_id` : même nom et même type (texte) que chez GDC,
--    pour qu'une jointure côté lecteur n'ait rien à convertir (ADR-001 D5).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.intervenants_aurion (
  aurion_individu_id text primary key,
  nom_affiche text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.intervenants_aurion is
  'Intervenants vus dans les séances Aurion : identifiant de fiche individu '
  'et nom affiché, sans autre donnée personnelle. Hors api_v1.';

alter table public.intervenants_aurion enable row level security;

drop trigger if exists trg_intervenants_aurion_set_updated_at on public.intervenants_aurion;
create trigger trg_intervenants_aurion_set_updated_at
  before update on public.intervenants_aurion
  for each row execute function public.set_updated_at();

drop policy if exists intervenants_aurion_select on public.intervenants_aurion;
create policy intervenants_aurion_select
  on public.intervenants_aurion for select to authenticated
  using (
    (select public.a_role('admin_planning'))
    or (select public.a_role('lecteur_interventions'))
  );

revoke all on table public.intervenants_aurion from anon, authenticated;
grant select, insert, update on table public.intervenants_aurion to service_role;
grant select on table public.intervenants_aurion to authenticated;
