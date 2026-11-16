-- Performance indexes for assignment tables
-- Run this in Supabase SQL Editor to speed up resource and worksheet queries

-- Resource assignments indexes
create index if not exists idx_resource_assignments_assigned_to_profile
on public.resource_assignments(assigned_to_profile_id);

create index if not exists idx_resource_assignments_assigned_to_business
on public.resource_assignments(assigned_to_business_id);

create index if not exists idx_resource_assignments_resource_document
on public.resource_assignments(resource_document_id);

-- Worksheet assignments indexes
create index if not exists idx_worksheet_assignments_assigned_to_profile
on public.worksheet_assignments(assigned_to_profile_id);

create index if not exists idx_worksheet_assignments_assigned_to_business
on public.worksheet_assignments(assigned_to_business_id);

create index if not exists idx_worksheet_assignments_worksheet
on public.worksheet_assignments(worksheet_id);

-- Documents indexes for assignment queries
create index if not exists idx_documents_profile_business
on public.documents(profile_id, business_id);

create index if not exists idx_documents_related_entity
on public.documents(related_entity_type, related_entity_id);

-- Composite index for resource assignment lookups
create index if not exists idx_resource_assignments_lookup
on public.resource_assignments(assigned_to_profile_id, created_at desc);

-- Composite index for worksheet assignment lookups
create index if not exists idx_worksheet_assignments_lookup
on public.worksheet_assignments(assigned_to_profile_id, created_at desc);