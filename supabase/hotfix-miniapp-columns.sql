-- Hotfix for MAX mini-app lead columns.
-- Run in Supabase SQL Editor if mini-app submit returns PGRST204 missing column errors.

create extension if not exists pgcrypto;

create table if not exists public.max_miniapp_leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  address text,
  object_type text,
  comment text,
  windows jsonb not null default '[]'::jsonb,
  area_m2 numeric,
  estimated_total integer,
  price_per_m2 integer,
  max_user_id bigint,
  max_username text,
  max_chat_id bigint,
  init_data_valid boolean not null default false,
  validation_reason text,
  status text not null default 'new',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.max_miniapp_leads add column if not exists mounting_type text;
alter table public.max_miniapp_leads add column if not exists expected_date text;
alter table public.max_miniapp_leads add column if not exists need_zippers boolean not null default false;
alter table public.max_miniapp_leads add column if not exists install_per_m2 integer;
alter table public.max_miniapp_leads add column if not exists install_total integer;
alter table public.max_miniapp_leads add column if not exists zipper_total integer;
alter table public.max_miniapp_leads add column if not exists photo_data_url text;
alter table public.max_miniapp_leads add column if not exists photo_info jsonb not null default '{}'::jsonb;
alter table public.max_miniapp_leads add column if not exists crm_status text not null default 'new';
alter table public.max_miniapp_leads add column if not exists crm_result jsonb not null default '{}'::jsonb;

create index if not exists max_miniapp_leads_created_at_idx on public.max_miniapp_leads(created_at desc);
create index if not exists max_miniapp_leads_status_idx on public.max_miniapp_leads(status);
create index if not exists max_miniapp_leads_phone_idx on public.max_miniapp_leads(phone);
create index if not exists max_miniapp_leads_max_user_id_idx on public.max_miniapp_leads(max_user_id);
create index if not exists max_miniapp_leads_crm_status_idx on public.max_miniapp_leads(crm_status);

-- Ask PostgREST/Supabase API to reload schema cache.
notify pgrst, 'reload schema';
