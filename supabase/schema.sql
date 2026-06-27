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
