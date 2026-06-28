-- MAX Admin MVP v4: Supabase schema with Webhook
-- Вставьте этот SQL в Supabase → SQL Editor → Run.

create extension if not exists pgcrypto;

create table if not exists public.max_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chat_id bigint not null unique,
  active boolean not null default true,
  source text not null default 'manual',
  last_update_type text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.max_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.max_send_logs (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  post_text text not null,
  buttons jsonb not null default '[]'::jsonb,
  has_image boolean not null default false,
  ok boolean not null default false,
  status integer,
  response jsonb,
  sent_at timestamptz not null default now()
);


create table if not exists public.max_webhook_events (
  id uuid primary key default gen_random_uuid(),
  update_type text not null,
  chat_ids bigint[] not null default '{}'::bigint[],
  payload jsonb not null,
  processed_ok boolean not null default true,
  error text,
  saved_groups jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now()
);

-- Если таблица max_groups уже была создана в v3, эти команды безопасно добавят новые поля.
alter table public.max_groups add column if not exists source text not null default 'manual';
alter table public.max_groups add column if not exists last_update_type text;
alter table public.max_groups add column if not exists last_event_at timestamptz;
alter table public.max_groups add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists max_groups_set_updated_at on public.max_groups;
create trigger max_groups_set_updated_at
before update on public.max_groups
for each row execute function public.set_updated_at();

create index if not exists max_groups_active_idx on public.max_groups(active);
create index if not exists max_send_logs_sent_at_idx on public.max_send_logs(sent_at desc);
create index if not exists max_send_logs_chat_id_idx on public.max_send_logs(chat_id);
create index if not exists max_templates_active_idx on public.max_templates(active);
create index if not exists max_webhook_events_received_at_idx on public.max_webhook_events(received_at desc);
create index if not exists max_webhook_events_update_type_idx on public.max_webhook_events(update_type);

alter table public.max_groups enable row level security;
alter table public.max_templates enable row level security;
alter table public.max_send_logs enable row level security;
alter table public.max_webhook_events enable row level security;

-- Публичных политик нет специально: клиентский браузер не получает ключ Supabase.
-- Серверные функции Vercel работают через SUPABASE_SERVICE_ROLE_KEY и обходят RLS.

insert into public.max_templates (key, title, text, active)
values
  ('soft', 'Мягкие окна', 'Мягкие окна в Омске

Изготовление и установка мягких окон для беседок, веранд и террас.
ПВХ-плёнка, окантовка, люверсы/скобы, аккуратный монтаж.

Бесплатный замер. Напишите — рассчитаем стоимость по размерам.', true),
  ('eva', 'EVA коврики', 'EVA коврики в Омске

Изготовим коврики под ваш автомобиль.
Подбор по марке, модели и году. Аккуратная окантовка, разные цвета.

Напишите марку авто — рассчитаем стоимость.', true),
  ('promo', 'Акция', 'Акция на мягкие окна

Для беседок, веранд и террас.
Замер, изготовление и монтаж в Омске и области.

Напишите сегодня — рассчитаем стоимость и подскажем оптимальный вариант крепления.', true)
on conflict (key) do update
set title = excluded.title,
    text = excluded.text,
    active = excluded.active;

-- Пример группы. Замените chat_id на реальный или добавьте группу из админки.
-- insert into public.max_groups (name, chat_id, active)
-- values ('Тестовая группа MAX', 123456789, true)
-- on conflict (chat_id) do update set name = excluded.name, active = true;

-- v9 cleanup: удаляем ошибочно созданные группы с chat_id = 0.
delete from public.max_groups where chat_id = 0;

-- v9 safety: chat_id не должен быть 0.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'max_groups_chat_id_not_zero'
  ) then
    alter table public.max_groups
      add constraint max_groups_chat_id_not_zero check (chat_id <> 0);
  end if;
end $$;

-- v11 scheduler: запланированные посты.
create table if not exists public.max_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  post_text text not null,
  chat_ids bigint[] not null,
  group_names text[] not null default '{}'::text[],
  buttons jsonb not null default '[]'::jsonb,
  image_data_url text,
  has_image boolean not null default false,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  sent_at timestamptz,
  last_error text,
  attempt_count integer not null default 0,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint max_scheduled_posts_status_check check (status in ('scheduled', 'processing', 'sent', 'failed', 'cancelled')),
  constraint max_scheduled_posts_chat_ids_not_empty check (array_length(chat_ids, 1) is not null),
  constraint max_scheduled_posts_chat_ids_not_zero check (not (0 = any(chat_ids)))
);

alter table public.max_scheduled_posts add column if not exists group_names text[] not null default '{}'::text[];
alter table public.max_scheduled_posts add column if not exists image_data_url text;
alter table public.max_scheduled_posts add column if not exists has_image boolean not null default false;
alter table public.max_scheduled_posts add column if not exists sent_at timestamptz;
alter table public.max_scheduled_posts add column if not exists last_error text;
alter table public.max_scheduled_posts add column if not exists attempt_count integer not null default 0;
alter table public.max_scheduled_posts add column if not exists result jsonb;
alter table public.max_scheduled_posts add column if not exists updated_at timestamptz not null default now();

alter table public.max_scheduled_posts enable row level security;

create index if not exists max_scheduled_posts_due_idx on public.max_scheduled_posts(status, scheduled_at);
create index if not exists max_scheduled_posts_created_at_idx on public.max_scheduled_posts(created_at desc);

drop trigger if exists max_scheduled_posts_set_updated_at on public.max_scheduled_posts;
create trigger max_scheduled_posts_set_updated_at
before update on public.max_scheduled_posts
for each row execute function public.set_updated_at();

-- v14 mini app: заявки из мини-приложения MAX.
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
  updated_at timestamptz not null default now(),
  constraint max_miniapp_leads_status_check check (status in ('new', 'contacted', 'measured', 'ordered', 'cancelled'))
);

alter table public.max_miniapp_leads add column if not exists name text;
alter table public.max_miniapp_leads add column if not exists phone text;
alter table public.max_miniapp_leads add column if not exists address text;
alter table public.max_miniapp_leads add column if not exists object_type text;
alter table public.max_miniapp_leads add column if not exists comment text;
alter table public.max_miniapp_leads add column if not exists windows jsonb not null default '[]'::jsonb;
alter table public.max_miniapp_leads add column if not exists area_m2 numeric;
alter table public.max_miniapp_leads add column if not exists estimated_total integer;
alter table public.max_miniapp_leads add column if not exists price_per_m2 integer;
alter table public.max_miniapp_leads add column if not exists max_user_id bigint;
alter table public.max_miniapp_leads add column if not exists max_username text;
alter table public.max_miniapp_leads add column if not exists max_chat_id bigint;
alter table public.max_miniapp_leads add column if not exists init_data_valid boolean not null default false;
alter table public.max_miniapp_leads add column if not exists validation_reason text;
alter table public.max_miniapp_leads add column if not exists status text not null default 'new';
alter table public.max_miniapp_leads add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.max_miniapp_leads add column if not exists updated_at timestamptz not null default now();

alter table public.max_miniapp_leads enable row level security;

create index if not exists max_miniapp_leads_created_at_idx on public.max_miniapp_leads(created_at desc);
create index if not exists max_miniapp_leads_status_idx on public.max_miniapp_leads(status);
create index if not exists max_miniapp_leads_phone_idx on public.max_miniapp_leads(phone);
create index if not exists max_miniapp_leads_max_user_id_idx on public.max_miniapp_leads(max_user_id);

drop trigger if exists max_miniapp_leads_set_updated_at on public.max_miniapp_leads;
create trigger max_miniapp_leads_set_updated_at
before update on public.max_miniapp_leads
for each row execute function public.set_updated_at();

-- v16 mini app upgrade: фото замера, опции расчёта, очередь интеграции с CRM.
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

create index if not exists max_miniapp_leads_crm_status_idx on public.max_miniapp_leads(crm_status);

create table if not exists public.max_crm_leads (
  id uuid primary key default gen_random_uuid(),
  miniapp_lead_id uuid,
  name text,
  phone text,
  address text,
  object_type text,
  status text not null default 'new',
  area_m2 numeric,
  estimated_total integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.max_crm_leads add column if not exists miniapp_lead_id uuid;
alter table public.max_crm_leads add column if not exists name text;
alter table public.max_crm_leads add column if not exists phone text;
alter table public.max_crm_leads add column if not exists address text;
alter table public.max_crm_leads add column if not exists object_type text;
alter table public.max_crm_leads add column if not exists status text not null default 'new';
alter table public.max_crm_leads add column if not exists area_m2 numeric;
alter table public.max_crm_leads add column if not exists estimated_total integer;
alter table public.max_crm_leads add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.max_crm_leads add column if not exists updated_at timestamptz not null default now();

alter table public.max_crm_leads enable row level security;

create index if not exists max_crm_leads_created_at_idx on public.max_crm_leads(created_at desc);
create index if not exists max_crm_leads_status_idx on public.max_crm_leads(status);
create index if not exists max_crm_leads_phone_idx on public.max_crm_leads(phone);
create index if not exists max_crm_leads_miniapp_lead_id_idx on public.max_crm_leads(miniapp_lead_id);

drop trigger if exists max_crm_leads_set_updated_at on public.max_crm_leads;
create trigger max_crm_leads_set_updated_at
before update on public.max_crm_leads
for each row execute function public.set_updated_at();

-- v19 price settings: цены для расчёта в мини-приложении.
create table if not exists public.max_price_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value numeric not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.max_price_settings add column if not exists key text;
alter table public.max_price_settings add column if not exists value numeric;
alter table public.max_price_settings add column if not exists description text;
alter table public.max_price_settings add column if not exists active boolean not null default true;
alter table public.max_price_settings add column if not exists updated_at timestamptz not null default now();

alter table public.max_price_settings enable row level security;
create unique index if not exists max_price_settings_key_unique on public.max_price_settings(key);
create index if not exists max_price_settings_active_idx on public.max_price_settings(active);

drop trigger if exists max_price_settings_set_updated_at on public.max_price_settings;
create trigger max_price_settings_set_updated_at
before update on public.max_price_settings
for each row execute function public.set_updated_at();

insert into public.max_price_settings (key, value, description, active)
values
  ('manufacturing_price_per_m2', 1500, 'Цена изготовления мягкого окна за 1 м², ₽', true),
  ('installation_price_per_m2', 500, 'Цена монтажа за 1 м², ₽', true),
  ('zipper_price_per_opening', 700, 'Доплата за молнию на один проём, ₽', true),
  ('min_order_price', 5000, 'Минимальная сумма заказа, ₽', true)
on conflict (key) do update
set value = public.max_price_settings.value,
    description = excluded.description,
    active = true;

notify pgrst, 'reload schema';

-- v20: источники заявок из рекламных постов и UTM-метки
alter table public.max_miniapp_leads add column if not exists source text;
alter table public.max_miniapp_leads add column if not exists utm_source text;
alter table public.max_miniapp_leads add column if not exists utm_medium text;
alter table public.max_miniapp_leads add column if not exists utm_campaign text;
alter table public.max_miniapp_leads add column if not exists utm_content text;
alter table public.max_miniapp_leads add column if not exists utm_term text;
alter table public.max_miniapp_leads add column if not exists ref_chat_id text;
alter table public.max_miniapp_leads add column if not exists landing_url text;

create index if not exists max_miniapp_leads_source_idx on public.max_miniapp_leads(source);
create index if not exists max_miniapp_leads_utm_campaign_idx on public.max_miniapp_leads(utm_campaign);
create index if not exists max_miniapp_leads_utm_content_idx on public.max_miniapp_leads(utm_content);

notify pgrst, 'reload schema';

-- v22: аудитория мини-приложения, сохранение каждого перехода и экспорт в Яндекс Аудитории.
alter table public.max_miniapp_leads add column if not exists visitor_id text;
alter table public.max_miniapp_leads add column if not exists visit_id text;
alter table public.max_miniapp_leads add column if not exists privacy_consent boolean not null default false;
alter table public.max_miniapp_leads add column if not exists ad_consent boolean not null default false;
alter table public.max_miniapp_leads add column if not exists consent_text text;
alter table public.max_miniapp_leads add column if not exists consent_at timestamptz;

create index if not exists max_miniapp_leads_visitor_id_idx on public.max_miniapp_leads(visitor_id);
create index if not exists max_miniapp_leads_visit_id_idx on public.max_miniapp_leads(visit_id);
create index if not exists max_miniapp_leads_ad_consent_idx on public.max_miniapp_leads(ad_consent);

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

alter table public.max_miniapp_visits add column if not exists visit_id text;
alter table public.max_miniapp_visits add column if not exists visitor_id text;
alter table public.max_miniapp_visits add column if not exists event_type text not null default 'miniapp_open';
alter table public.max_miniapp_visits add column if not exists max_user_id bigint;
alter table public.max_miniapp_visits add column if not exists max_username text;
alter table public.max_miniapp_visits add column if not exists max_first_name text;
alter table public.max_miniapp_visits add column if not exists max_last_name text;
alter table public.max_miniapp_visits add column if not exists max_chat_id bigint;
alter table public.max_miniapp_visits add column if not exists source text;
alter table public.max_miniapp_visits add column if not exists utm_source text;
alter table public.max_miniapp_visits add column if not exists utm_medium text;
alter table public.max_miniapp_visits add column if not exists utm_campaign text;
alter table public.max_miniapp_visits add column if not exists utm_content text;
alter table public.max_miniapp_visits add column if not exists utm_term text;
alter table public.max_miniapp_visits add column if not exists ref_chat_id text;
alter table public.max_miniapp_visits add column if not exists landing_url text;
alter table public.max_miniapp_visits add column if not exists referrer text;
alter table public.max_miniapp_visits add column if not exists init_data_valid boolean not null default false;
alter table public.max_miniapp_visits add column if not exists validation_reason text;
alter table public.max_miniapp_visits add column if not exists user_agent text;
alter table public.max_miniapp_visits add column if not exists device_info jsonb not null default '{}'::jsonb;
alter table public.max_miniapp_visits add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.max_miniapp_visits add column if not exists updated_at timestamptz not null default now();

alter table public.max_miniapp_visits enable row level security;
create unique index if not exists max_miniapp_visits_visit_id_unique on public.max_miniapp_visits(visit_id);
create index if not exists max_miniapp_visits_created_at_idx on public.max_miniapp_visits(created_at desc);
create index if not exists max_miniapp_visits_visitor_id_idx on public.max_miniapp_visits(visitor_id);
create index if not exists max_miniapp_visits_max_user_id_idx on public.max_miniapp_visits(max_user_id);
create index if not exists max_miniapp_visits_utm_campaign_idx on public.max_miniapp_visits(utm_campaign);
create index if not exists max_miniapp_visits_event_type_idx on public.max_miniapp_visits(event_type);

drop trigger if exists max_miniapp_visits_set_updated_at on public.max_miniapp_visits;
create trigger max_miniapp_visits_set_updated_at
before update on public.max_miniapp_visits
for each row execute function public.set_updated_at();

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

alter table public.max_miniapp_audience add column if not exists visitor_id text;
alter table public.max_miniapp_audience add column if not exists first_visit_id text;
alter table public.max_miniapp_audience add column if not exists last_visit_id text;
alter table public.max_miniapp_audience add column if not exists max_user_id bigint;
alter table public.max_miniapp_audience add column if not exists max_username text;
alter table public.max_miniapp_audience add column if not exists max_first_name text;
alter table public.max_miniapp_audience add column if not exists max_last_name text;
alter table public.max_miniapp_audience add column if not exists source text;
alter table public.max_miniapp_audience add column if not exists utm_source text;
alter table public.max_miniapp_audience add column if not exists utm_medium text;
alter table public.max_miniapp_audience add column if not exists utm_campaign text;
alter table public.max_miniapp_audience add column if not exists utm_content text;
alter table public.max_miniapp_audience add column if not exists landing_url text;
alter table public.max_miniapp_audience add column if not exists init_data_valid boolean not null default false;
alter table public.max_miniapp_audience add column if not exists ad_consent boolean not null default false;
alter table public.max_miniapp_audience add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.max_miniapp_audience add column if not exists first_seen_at timestamptz not null default now();
alter table public.max_miniapp_audience add column if not exists last_seen_at timestamptz not null default now();
alter table public.max_miniapp_audience add column if not exists updated_at timestamptz not null default now();

alter table public.max_miniapp_audience enable row level security;
create unique index if not exists max_miniapp_audience_visitor_id_unique on public.max_miniapp_audience(visitor_id);
create index if not exists max_miniapp_audience_last_seen_idx on public.max_miniapp_audience(last_seen_at desc);
create index if not exists max_miniapp_audience_max_user_id_idx on public.max_miniapp_audience(max_user_id);
create index if not exists max_miniapp_audience_utm_campaign_idx on public.max_miniapp_audience(utm_campaign);

drop trigger if exists max_miniapp_audience_set_updated_at on public.max_miniapp_audience;
create trigger max_miniapp_audience_set_updated_at
before update on public.max_miniapp_audience
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
-- v27 CRM Leads Board: дополнительные поля для работы с заявками в админке
alter table public.max_miniapp_leads
add column if not exists crm_note text;

alter table public.max_miniapp_leads
add column if not exists crm_next_action text;

alter table public.max_miniapp_leads
add column if not exists crm_updated_at timestamptz;

alter table public.max_miniapp_leads
add column if not exists crm_updated_by text;

create index if not exists max_miniapp_leads_crm_updated_at_idx
on public.max_miniapp_leads(crm_updated_at desc);

notify pgrst, 'reload schema';
