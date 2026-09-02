create table if not exists public.jaiyung_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jaiyung_user_state enable row level security;

drop policy if exists "jaiyung_state_select_own" on public.jaiyung_user_state;
create policy "jaiyung_state_select_own"
  on public.jaiyung_user_state for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "jaiyung_state_insert_own" on public.jaiyung_user_state;
create policy "jaiyung_state_insert_own"
  on public.jaiyung_user_state for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "jaiyung_state_update_own" on public.jaiyung_user_state;
create policy "jaiyung_state_update_own"
  on public.jaiyung_user_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "jaiyung_state_delete_own" on public.jaiyung_user_state;
create policy "jaiyung_state_delete_own"
  on public.jaiyung_user_state for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.jaiyung_user_state to authenticated;
revoke all on public.jaiyung_user_state from anon;
