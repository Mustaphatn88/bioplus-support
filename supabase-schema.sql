-- ============================================================================
-- BioPlus Support — Schéma Supabase (PostgreSQL + RLS + Storage)
-- Exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

create table public.laboratoires (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  adresse    text,
  ville      text,
  telephone  text,
  created_at timestamptz not null default now()
);

-- user_id = auth.uid() : ne JAMAIS utiliser auth.uid() comme identifiant de laboratoire.
create table public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  laboratoire_id uuid references public.laboratoires (id) on delete set null,
  role           text not null default 'technicien'
                 check (role in ('admin', 'responsable', 'technicien')),
  -- 'en_attente' : auto-inscription via QR, rien n'est visible tant que l'admin n'a pas validé
  statut         text not null default 'valide'
                 check (statut in ('en_attente', 'valide')),
  full_name      text,
  -- informations du laboratoire fournies à l'inscription (utilisées à la validation)
  laboratoire_nom      text,
  laboratoire_ville    text,
  laboratoire_adresse  text,
  laboratoire_telephone text,
  created_at     timestamptz not null default now()
);

create table public.automates (
  id            uuid primary key default gen_random_uuid(),
  laboratoire_id uuid not null references public.laboratoires (id) on delete cascade,
  nom           text not null,
  modele        text,
  numero_serie  text,
  statut        text not null default 'actif'
                check (statut in ('actif', 'maintenance', 'hors_service')),
  created_at    timestamptz not null default now()
);

create table public.tickets (
  id            uuid primary key default gen_random_uuid(),
  laboratoire_id uuid not null references public.laboratoires (id) on delete cascade,
  automate_id   uuid not null references public.automates (id) on delete restrict,
  numero_serie  text,
  message_erreur text,
  code_erreur   text,
  description   text,
  photo_path    text, -- chemin dans le bucket 'photos', ex : laboratoire_123/ticket_456.jpg
  priorite      text not null default 'normal'
                check (priorite in ('normal', 'important', 'critique')),
  statut        text not null default 'ouvert'
                check (statut in ('ouvert', 'en_cours', 'resolu')),
  -- technicien BioPlus désigné par l'admin pour traiter la réclamation (dispatch)
  technicien_id uuid references public.profiles (user_id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index if not exists tickets_laboratoire_idx on public.tickets (laboratoire_id);
create index if not exists tickets_automate_idx   on public.tickets (automate_id);
create index if not exists tickets_technicien_idx on public.tickets (technicien_id);
create index if not exists automates_labo_idx     on public.automates (laboratoire_id);

-- ---------------------------------------------------------------------------
-- 2. FONCTIONS UTILITAIRES
-- ---------------------------------------------------------------------------

-- Vrai si l'utilisateur courant appartient au laboratoire lab_id
-- ET que son compte est validé (les comptes « en attente » ne voient rien).
create or replace function public.is_member_of(lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.laboratoire_id = lab_id
      and p.statut = 'valide'
  );
$$;

-- Cast sécurisé text -> uuid (évite une erreur si le dossier Storage est malformé).
create or replace function public.uuid_or_null(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception
  when others then
    return null;
end $$;

-- Rôle de l'utilisateur courant (null si profil absent).
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

-- Crée automatiquement le profil à l'inscription d'un utilisateur.
-- - Inscription via l'app (QR) : statut 'en_attente' + infos du laboratoire fournies
-- - Création par l'admin (Edge Function) : statut 'valide'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id, role, statut, full_name,
    laboratoire_nom, laboratoire_ville, laboratoire_adresse, laboratoire_telephone
  )
  values (
    new.id,
    'technicien',
    coalesce(new.raw_user_meta_data->>'statut', 'valide'),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_nom', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_ville', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_adresse', ''),
    nullif(new.raw_user_meta_data->>'laboratoire_telephone', '')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.laboratoires enable row level security;
alter table public.profiles      enable row level security;
alter table public.automates     enable row level security;
alter table public.tickets       enable row level security;

-- laboratoires : lecture pour tout utilisateur authentifié
create policy "laboratoires_select_authenticated"
  on public.laboratoires for select
  to authenticated
  using (true);

-- profiles : chacun ne voit/modifie que son propre profil
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Un utilisateur ne peut modifier que son propre nom : le rôle, le statut et le
-- laboratoire ne sont modifiables que par l'admin (impossible de s'auto-valider).
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- profiles : l'administrateur BioPlus lit et modifie tous les profils
-- (création de comptes, changements de rôle / de laboratoire)
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.current_role() = 'admin');

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.current_role() = 'admin')
  with check (true);

-- automates : lecture pour les membres du laboratoire uniquement
create policy "automates_select_member"
  on public.automates for select
  to authenticated
  using (public.is_member_of(laboratoire_id));

-- automates : ajout / modification par tout membre du laboratoire (biologiste, technicien)
create policy "automates_insert_manager"
  on public.automates for insert
  to authenticated
  with check (
    public.is_member_of(laboratoire_id)
  );

create policy "automates_update_manager"
  on public.automates for update
  to authenticated
  using (
    public.is_member_of(laboratoire_id)
  )
  with check (
    public.is_member_of(laboratoire_id)
  );

create policy "automates_delete_manager"
  on public.automates for delete
  to authenticated
  using (
    public.is_member_of(laboratoire_id)
    and public.current_role() in ('responsable', 'admin')
  );

-- tickets : lecture pour les membres du laboratoire, l'admin (dispatch) et le technicien assigné
create policy "tickets_select_member"
  on public.tickets for select
  to authenticated
  using (
    public.is_member_of(laboratoire_id)
    or public.current_role() = 'admin'
    or technicien_id = auth.uid()
  );

create policy "tickets_insert_member"
  on public.tickets for insert
  to authenticated
  with check (
    public.is_member_of(laboratoire_id)
    and exists (
      select 1
      from public.automates a
      where a.id = automate_id
        and a.laboratoire_id = laboratoire_id
    )
  );

-- tickets : mise à jour par le membre du laboratoire, l'admin (assignation)
-- et le technicien assigné (suivi du statut).
create policy "tickets_update_member"
  on public.tickets for update
  to authenticated
  using (
    public.is_member_of(laboratoire_id)
    or public.current_role() = 'admin'
    or technicien_id = auth.uid()
  )
  with check (
    public.is_member_of(laboratoire_id)
    or public.current_role() = 'admin'
    or technicien_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 4. STOCKAGE DES PHOTOS (jamais de base64 en base)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Un utilisateur ne peut manipuler que les fichiers du dossier de son laboratoire.
-- Le premier segment du chemin (folder) est le laboratoire_id.
create policy "photos_insert_own_labo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
  );

create policy "photos_select_own_labo"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'photos'
    and public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
  );

create policy "photos_update_own_labo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos'
    and public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'photos'
    and public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
  );

create policy "photos_delete_own_labo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and public.is_member_of(public.uuid_or_null((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------------
-- 5. DONNÉES DE DÉMO (optionnel — à retirer ou adapter en production)
-- ---------------------------------------------------------------------------

insert into public.laboratoires (nom, ville, telephone)
values ('Laboratoire BioPlus Tunis', 'Tunis', '+216 71 000 000')
on conflict do nothing;

insert into public.laboratoires (nom, adresse, ville, telephone)
values ('Laboratoire Clinique Ibn Sina', '12 avenue Habib Bourguiba', 'La Marsa', '+216 71 111 222')
on conflict do nothing;

insert into public.automates (laboratoire_id, nom, modele, numero_serie)
select id, 'Pentra 60', 'Horiba ABX Pentra 60', 'P60-0001'
from public.laboratoires
where nom = 'Laboratoire BioPlus Tunis'
  and not exists (select 1 from public.automates where numero_serie = 'P60-0001');

insert into public.automates (laboratoire_id, nom, modele, numero_serie)
select id, 'Pentra 60 CXP', 'Horiba ABX Pentra 60 CXP', 'P60-0002'
from public.laboratoires
where nom = 'Laboratoire Clinique Ibn Sina'
  and not exists (select 1 from public.automates where numero_serie = 'P60-0002');

-- Après avoir créé un utilisateur dans Authentication > Users, lui affecter un laboratoire :
-- update public.profiles
-- set laboratoire_id = (select id from public.laboratoires where nom = 'Laboratoire BioPlus Tunis'),
--     role = 'technicien'
-- where user_id = 'UUID_DE_L_UTILISATEUR';