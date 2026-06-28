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
