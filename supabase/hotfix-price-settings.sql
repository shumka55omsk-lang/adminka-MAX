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

create unique index if not exists max_price_settings_key_unique on public.max_price_settings(key);

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
