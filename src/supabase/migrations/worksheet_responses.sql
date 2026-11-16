-- Worksheet responses table for user worksheet completions
-- Run this in Supabase SQL Editor

create table if not exists public.worksheet_responses (
  id uuid primary key default gen_random_uuid(),
  worksheet_assignment_id uuid references public.worksheet_assignments(id) on delete set null,
  worksheet_id text not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  business_id uuid references public.businesses(id) on delete set null,
  response_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'completed')),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_worksheet_responses_profile
on public.worksheet_responses(profile_id);

create index if not exists idx_worksheet_responses_worksheet
on public.worksheet_responses(worksheet_id);

create index if not exists idx_worksheet_responses_assignment
on public.worksheet_responses(worksheet_assignment_id);

create index if not exists idx_worksheet_responses_status
on public.worksheet_responses(status);

-- Composite index for user's worksheet responses
create index if not exists idx_worksheet_responses_lookup
on public.worksheet_responses(profile_id, worksheet_id, updated_at desc);

-- Add submitted_by column to worksheet_assignments if not exists
alter table public.worksheet_assignments
add column if not exists completed_at timestamptz;

alter table public.worksheet_assignments
add column if not exists completed_by uuid references public.profiles(id);

-- Add notification type for worksheet completion
-- (Handled in notificationService mappings)