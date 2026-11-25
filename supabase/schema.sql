-- Run once in your Supabase SQL editor.
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
create policy admin_self on public.admins for select to authenticated using (user_id=auth.uid());
create table public.saves (user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null check (jsonb_typeof(data)='object' and octet_length(data::text)<500000), updated_at timestamptz not null default now());
alter table public.saves enable row level security;
create policy read_saves on public.saves for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.admins where user_id=auth.uid()));
create policy insert_own on public.saves for insert to authenticated with check(user_id=auth.uid());
create policy update_own on public.saves for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy admin_update on public.saves for update to authenticated using(exists(select 1 from public.admins where user_id=auth.uid())) with check(exists(select 1 from public.admins where user_id=auth.uid()));
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
revoke all on public.saves from anon, authenticated;
grant select,insert,update on public.saves to authenticated;
-- Private realtime channels: authenticated users can join the shared lobby.
create policy lobby_read on realtime.messages for select to authenticated using (realtime.topic()='outbreak-lobby' and extension in ('presence','broadcast'));
create policy lobby_write on realtime.messages for insert to authenticated with check (realtime.topic()='outbreak-lobby' and extension in ('presence','broadcast'));
-- After creating your own account, replace UUID below and run separately:
-- insert into public.admins(user_id) values ('YOUR-AUTH-USER-UUID');
