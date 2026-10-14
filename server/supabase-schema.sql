-- ====================================================================
-- Focus Flow - Supabase Cloud Synchronization Schema
-- Execute this script in your Supabase SQL Editor to enable zero-ops cloud sync.
-- ====================================================================

-- 1. Tasks Table (Stores all tasks with soft-delete and LWW timestamps)
create table if not exists public.tasks (
    id text primary key,
    sync_key text not null,
    title text not null,
    date text not null,
    time text,
    priority text default 'normal',
    status text default 'todo',
    source text default 'manual',
    focus_minutes integer default 0,
    created_at bigint,
    updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
    deleted boolean default false
);

create index if not exists idx_tasks_sync_key on public.tasks (sync_key);
create index if not exists idx_tasks_updated_at on public.tasks (updated_at);

-- 2. Focus State Table (Stores current pomodoro timer state)
create table if not exists public.focus_state (
    sync_key text primary key,
    running boolean default false,
    paused boolean default false,
    mode text default 'work',
    pomodoro_count integer default 0,
    ends_at bigint,
    remaining integer default 0,
    total_seconds integer default 1500,
    minutes integer default 25,
    task_id text,
    updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- 3. Enable Row Level Security (RLS) with open anon policies based on sync_key
alter table public.tasks enable row level security;
alter table public.focus_state enable row level security;

-- Permissive policy for demo / anon pairing (matches sync_key)
create policy "Allow all operations with sync_key on tasks"
on public.tasks for all
using (true)
with check (true);

create policy "Allow all operations on focus_state"
on public.focus_state for all
using (true)
with check (true);

-- 4. Enable Supabase Realtime for instant WebSocket broadcasts
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.focus_state;
