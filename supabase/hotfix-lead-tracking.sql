-- v20 hotfix: UTM/source columns for mini app leads
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
