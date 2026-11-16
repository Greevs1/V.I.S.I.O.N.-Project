-- ═════════════════════════════════════════════════════════════════════════════
-- PHASE S2 — STORAGE CONTAINMENT — VERIFICATION (READ-ONLY)
--
-- Safe to run repeatedly. Modifies nothing. Returns ONE ROW.
-- Run immediately after phase_s2_storage_containment.sql, and again later to
-- confirm the posture has not drifted.
--
-- EXPECTED AFTER MIGRATION
--   documents_bucket_exists                     true
--   documents_bucket_public                     false
--   client_documents_bucket_exists              true
--   client_documents_bucket_public              false
--   consulting_library_bucket_exists            true
--   consulting_library_bucket_public            false
--   target_policies_remaining                   0
--   unexpected_documents_authenticated_policies 0
--
--   total_storage_object_policies is INFORMATIONAL. It is NOT expected to be 0 —
--   unrelated, legitimate policies may exist now or later. Do not assert it.
-- ═════════════════════════════════════════════════════════════════════════════

select
  -- ── Bucket existence ──
  exists (select 1 from storage.buckets where id = 'documents')
                                                        as documents_bucket_exists,
  exists (select 1 from storage.buckets where id = 'client-documents')
                                                        as client_documents_bucket_exists,
  exists (select 1 from storage.buckets where id = 'consulting_library_files')
                                                        as consulting_library_bucket_exists,

  -- ── Bucket privacy (coalesce → true when the bucket is missing, so absence
  --    never reads as "private by accident") ──
  coalesce((select b.public from storage.buckets b where b.id = 'documents'),              true)
                                                        as documents_bucket_public,
  coalesce((select b.public from storage.buckets b where b.id = 'client-documents'),       true)
                                                        as client_documents_bucket_public,
  coalesce((select b.public from storage.buckets b where b.id = 'consulting_library_files'), true)
                                                        as consulting_library_bucket_public,

  -- ── Target policies must be gone ──
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('authenticated_read_documents',
                         'authenticated_update_documents',
                         'authenticated_upload_documents'))
                                                        as target_policies_remaining,

  -- ── Informational only — do NOT assert 0 ──
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects')
                                                        as total_storage_object_policies,

  -- ── Any policy still granting `authenticated` access that references the
  --    documents bucket, regardless of its name. Must be 0. ──
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and 'authenticated' = any(roles)
      and (coalesce(qual, '') like '%documents%'
        or coalesce(with_check, '') like '%documents%'))
                                                        as unexpected_documents_authenticated_policies;


-- ═════════════════════════════════════════════════════════════════════════════
-- SUPPORTING DETAIL (optional, read-only) — the full current policy surface on
-- storage.objects, so a reviewer can confirm nothing unrelated was disturbed.
-- ═════════════════════════════════════════════════════════════════════════════
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;


-- ═════════════════════════════════════════════════════════════════════════════
-- BUCKET CONFIGURATION (optional, read-only) — confirms S2 did not alter
-- file_size_limit / allowed_mime_types (both expected still NULL).
-- ═════════════════════════════════════════════════════════════════════════════
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 where id in ('documents', 'client-documents', 'consulting_library_files')
 order by id;

-- ═════════════════════════════════════════════════════════════════════════════
-- END PHASE S2 VERIFICATION — READ-ONLY
-- ═════════════════════════════════════════════════════════════════════════════