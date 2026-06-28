-- v28 Growth Suite: CRM, шаблоны, рейтинг групп, антидубли и экспорты

-- CRM-поля заявок, если v27 hotfix ещё не применён
alter table public.max_miniapp_leads add column if not exists crm_note text;
alter table public.max_miniapp_leads add column if not exists crm_next_action text;
alter table public.max_miniapp_leads add column if not exists crm_updated_at timestamptz;
alter table public.max_miniapp_leads add column if not exists crm_updated_by text;
alter table public.max_miniapp_leads add column if not exists crm_status text not null default 'new';
alter table public.max_miniapp_leads add column if not exists crm_result jsonb not null default '{}'::jsonb;
alter table public.max_miniapp_leads add column if not exists visitor_id text;
alter table public.max_miniapp_leads add column if not exists visit_id text;
alter table public.max_miniapp_leads add column if not exists source text;
alter table public.max_miniapp_leads add column if not exists utm_source text;
alter table public.max_miniapp_leads add column if not exists utm_medium text;
alter table public.max_miniapp_leads add column if not exists utm_campaign text;
alter table public.max_miniapp_leads add column if not exists utm_content text;
alter table public.max_miniapp_leads add column if not exists ref_chat_id text;
alter table public.max_miniapp_leads add column if not exists landing_url text;

create index if not exists max_miniapp_leads_crm_status_idx on public.max_miniapp_leads(crm_status);
create index if not exists max_miniapp_leads_crm_updated_at_idx on public.max_miniapp_leads(crm_updated_at desc);
create index if not exists max_miniapp_leads_phone_recent_idx on public.max_miniapp_leads(phone, created_at desc);
create index if not exists max_miniapp_leads_visitor_recent_idx on public.max_miniapp_leads(visitor_id, created_at desc);
create index if not exists max_miniapp_leads_campaign_idx on public.max_miniapp_leads(utm_campaign);

-- Библиотека шаблонов постов
create table if not exists public.max_templates (
  id bigserial primary key,
  key text not null unique,
  title text not null,
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.max_templates add column if not exists active boolean not null default true;
create index if not exists max_templates_active_idx on public.max_templates(active);

-- Таблицы аудитории, если v22 ещё не применён
create table if not exists public.max_miniapp_visits (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event_type text not null default 'miniapp_open',
  visitor_id text,
  visit_id text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ref_chat_id text,
  landing_url text,
  referrer text,
  max_user_id bigint,
  max_username text,
  raw_payload jsonb not null default '{}'::jsonb
);

alter table public.max_miniapp_visits add column if not exists ref_chat_id text;
alter table public.max_miniapp_visits add column if not exists landing_url text;
create index if not exists max_miniapp_visits_created_at_idx on public.max_miniapp_visits(created_at desc);
create index if not exists max_miniapp_visits_visitor_id_idx on public.max_miniapp_visits(visitor_id);
create index if not exists max_miniapp_visits_campaign_idx on public.max_miniapp_visits(utm_campaign);
create index if not exists max_miniapp_visits_ref_chat_id_idx on public.max_miniapp_visits(ref_chat_id);

notify pgrst, 'reload schema';
