-- v22 hotfix: аудитория мини-приложения для Яндекс Директ / Яндекс Аудиторий.
-- Выполнить в Supabase SQL Editor.

alter table public.max_miniapp_leads add column if not exists visitor_id text;
alter table public.max_miniapp_leads add column if not exists visit_id text;
alter table public.max_miniapp_leads add column if not exists privacy_consent boolean not null default false;
alter table public.max_miniapp_leads add column if not exists ad_consent boolean not null default false;
alter table public.max_miniapp_leads add column if not exists consent_text text;
alter table public.max_miniapp_leads add column if not exists consent_at timestamptz;

create table if not exists public.max_miniapp_visits (
  id uuid primary key default gen_random_uuid(),
  visit_id text not null unique,
  visitor_id text not null,
  event_type text not null default 'miniapp_open',
  max_user_id bigint,
  max_username text,
  max_first_name text,
  max_last_name text,
  max_chat_id bigint,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ref_chat_id text,
  landing_url text,
  referrer text,
  init_data_valid boolean not null default false,
  validation_reason text,
  user_agent text,
  device_info jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.max_miniapp_audience (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null unique,
  first_visit_id text,
  last_visit_id text,
  max_user_id bigint,
  max_username text,
  max_first_name text,
  max_last_name text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  landing_url text,
  init_data_valid boolean not null default false,
  ad_consent boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.max_miniapp_visits enable row level security;
alter table public.max_miniapp_audience enable row level security;

create unique index if not exists max_miniapp_visits_visit_id_unique on public.max_miniapp_visits(visit_id);
create index if not exists max_miniapp_visits_created_at_idx on public.max_miniapp_visits(created_at desc);
create index if not exists max_miniapp_visits_visitor_id_idx on public.max_miniapp_visits(visitor_id);
create index if not exists max_miniapp_visits_utm_campaign_idx on public.max_miniapp_visits(utm_campaign);
create unique index if not exists max_miniapp_audience_visitor_id_unique on public.max_miniapp_audience(visitor_id);
create index if not exists max_miniapp_audience_last_seen_idx on public.max_miniapp_audience(last_seen_at desc);
create index if not exists max_miniapp_audience_utm_campaign_idx on public.max_miniapp_audience(utm_campaign);

notify pgrst, 'reload schema';
