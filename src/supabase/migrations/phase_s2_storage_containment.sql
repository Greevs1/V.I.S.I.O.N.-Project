-- ═════════════════════════════════════════════════════════════════════════════
-- PHASE S2 — STORAGE CONTAINMENT — IMPLEMENTATION SLICE 1
--
-- ███  PREPARED, NOT EXECUTED. RUN MANUALLY IN THE SUPABASE SQL EDITOR.  ███
--
-- EFFECT — exactly one thing:
--     remove the three unsafe `authenticated` policies on storage.objects
--     for the `documents` bucket.
--
-- NOTHING ELSE IS TOUCHED. Not the buckets, not their configuration, not
-- file_size_limit, not allowed_mime_types, not any application table, schema,
-- function, or policy.
--
-- WHY THIS IS SAFE (see VISION_STORAGE_CONTAINMENT_PREFLIGHT.md)
--   · The three policies are granted TO authenticated.
--   · No live request resolves to role `authenticated` (Supabase Auth is unused).
--   · The browser uses the anon key  → role `anon`   → already ungranted.
--   · All 17 live Storage operations use service_role, which BYPASSES RLS and
--     therefore never consults these policies.
--   Removing them changes the outcome of ZERO legitimate requests.
--
-- ATOMICITY
--   One transaction. Every precondition is verified BEFORE the first DROP.
--   Any failure raises and aborts, leaving storage.objects byte-identical.
--
-- ROLLBACK
--   Exact restore SQL is in the commented SECTION R at the bottom.
--
-- COMPANION
--   phase_s2_storage_containment_verification.sql — read-only post-check.
-- ═════════════════════════════════════════════════════════════════════════════

begin;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — PRECONDITION GUARD
--
-- Verifies production still matches the audited state. If anything has drifted,
-- ABORT without dropping anything — an unexpected definition is never deleted.
--
-- Comparison is normalised (lower-cased; ::text casts, whitespace and
-- parentheses removed) so an equivalent expression such as
--     (bucket_id = 'documents'::text)
-- matches the audited shape
--     bucket_id = 'documents'
-- without being brittle about formatting.
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  t       record;
  a       record;
  v_qual  text;
  v_check text;
begin
  for t in
    select * from (values
      ('authenticated_read_documents',   'SELECT', 'bucket_id=''documents''', null::text),
      ('authenticated_update_documents', 'UPDATE', 'bucket_id=''documents''', 'bucket_id=''documents'''),
      ('authenticated_upload_documents', 'INSERT', null::text,               'bucket_id=''documents''')
    ) as x(pname, pcmd, pqual, pcheck)
  loop
    a := null;

    select policyname, cmd, roles, qual, with_check
      into a
      from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and policyname = t.pname;

    if a.policyname is null then
      raise exception '[S2] PRECONDITION FAILED — policy % not found on storage.objects. Nothing dropped.', t.pname;
    end if;

    if a.cmd is distinct from t.pcmd then
      raise exception '[S2] PRECONDITION FAILED — % has command %, expected %. Nothing dropped.',
        t.pname, a.cmd, t.pcmd;
    end if;

    if array_length(a.roles, 1) is distinct from 1 or not ('authenticated' = any(a.roles)) then
      raise exception '[S2] PRECONDITION FAILED — % is granted to %, expected exactly {authenticated}. Nothing dropped.',
        t.pname, a.roles;
    end if;

    v_qual := nullif(
      regexp_replace(
        regexp_replace(lower(coalesce(a.qual, '')), '::text', '', 'g'),
        '[[:space:]()]', '', 'g'
      ), '');

    v_check := nullif(
      regexp_replace(
        regexp_replace(lower(coalesce(a.with_check, '')), '::text', '', 'g'),
        '[[:space:]()]', '', 'g'
      ), '');

    if coalesce(v_qual, '') is distinct from coalesce(t.pqual, '') then
      raise exception '[S2] PRECONDITION FAILED — % USING is [%], expected the audited shape [%]. Nothing dropped.',
        t.pname, a.qual, t.pqual;
    end if;

    if coalesce(v_check, '') is distinct from coalesce(t.pcheck, '') then
      raise exception '[S2] PRECONDITION FAILED — % WITH CHECK is [%], expected the audited shape [%]. Nothing dropped.',
        t.pname, a.with_check, t.pcheck;
    end if;

    raise notice '[S2] precondition OK — % (cmd=%, roles=%)', t.pname, a.cmd, a.roles;
  end loop;

  raise notice '[S2] all three policies match the audited state.';
end $$;


-- Snapshot for the postcondition delta check.
create temporary table if not exists s2_policy_snapshot on commit drop as
select policyname from pg_policies
 where schemaname = 'storage' and tablename = 'objects';


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — THE CHANGE
-- ═════════════════════════════════════════════════════════════════════════════
drop policy if exists authenticated_read_documents   on storage.objects;
drop policy if exists authenticated_update_documents on storage.objects;
drop policy if exists authenticated_upload_documents on storage.objects;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — POSTCONDITION GUARD (inside the same transaction)
--
-- A. zero target policies remain
-- B. exactly 3 policies were removed and no unrelated policy was disturbed
-- C. all three buckets still exist
-- D. all three buckets remain private
-- E. bucket configuration unchanged (recorded, asserted non-public)
-- F. no application object touched (structural — this migration contains no
--    statement referencing anything outside storage.objects / storage.buckets)
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_remaining   int;
  v_before      int;
  v_after       int;
  v_missing     text;
  v_public      text;
begin
  -- A — target policies gone
  select count(*) into v_remaining
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('authenticated_read_documents',
                        'authenticated_update_documents',
                        'authenticated_upload_documents');

  if v_remaining <> 0 then
    raise exception '[S2] POSTCONDITION FAILED — % target policies still present. Rolling back.', v_remaining;
  end if;

  -- B — delta is exactly 3, nothing else disturbed
  select count(*) into v_before from s2_policy_snapshot;

  select count(*) into v_after
    from pg_policies where schemaname = 'storage' and tablename = 'objects';

  if v_before - v_after <> 3 then
    raise exception '[S2] POSTCONDITION FAILED — expected exactly 3 policies removed, but delta is %. Rolling back.',
      v_before - v_after;
  end if;

  -- C — all three buckets still exist
  select string_agg(b.id, ', ') into v_missing
    from (values ('documents'), ('client-documents'), ('consulting_library_files')) as b(id)
   where not exists (select 1 from storage.buckets sb where sb.id = b.id);

  if v_missing is not null then
    raise exception '[S2] POSTCONDITION FAILED — missing buckets: %. Rolling back.', v_missing;
  end if;

  -- D — all three buckets remain private
  select string_agg(sb.id, ', ') into v_public
    from storage.buckets sb
   where sb.id in ('documents', 'client-documents', 'consulting_library_files')
     and sb.public is true;

  if v_public is not null then
    raise exception '[S2] POSTCONDITION FAILED — buckets are PUBLIC: %. Rolling back.', v_public;
  end if;

  raise notice '[S2] postconditions passed — 3 policies removed, buckets intact and private.';
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — RECORD BUCKET CONFIG (read-only; proves config was not altered)
-- ═════════════════════════════════════════════════════════════════════════════
select id,
       public,
       file_size_limit,
       allowed_mime_types
  from storage.buckets
 where id in ('documents', 'client-documents', 'consulting_library_files')
 order by id;

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION R — ROLLBACK (commented; run ONLY to restore the exact prior state)
--
-- These reproduce the audited policies exactly. They are deliberately NOT
-- improved: rollback means restoring the prior state, not fixing it.
-- ═════════════════════════════════════════════════════════════════════════════
-- begin;
--   create policy authenticated_read_documents
--     on storage.objects for select to authenticated
--     using (bucket_id = 'documents');
--
--   create policy authenticated_update_documents
--     on storage.objects for update to authenticated
--     using (bucket_id = 'documents')
--     with check (bucket_id = 'documents');
--
--   create policy authenticated_upload_documents
--     on storage.objects for insert to authenticated
--     with check (bucket_id = 'documents');
-- commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- END PHASE S2 — SLICE 1 — PREPARED, NOT EXECUTED
-- ═════════════════════════════════════════════════════════════════════════════