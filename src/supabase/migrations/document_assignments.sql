-- ═════════════════════════════════════════════════════════════════════════════
-- DOCUMENT ASSIGNMENTS — one document ↔ one or more team members
--
-- STATUS: NOT EXECUTED. Run this deliberately in the Supabase SQL Editor.
-- The build tools hold READ-ONLY Supabase access (projects:read, secrets:read,
-- database:read — no database:write) and the project is SHARED, so a schema
-- change is a human decision. Idempotent and upgrade-safe: safe to re-run, and
-- safe to run over an earlier revision of this same file.
--
-- WHAT THIS IS
--   The collaboration layer around a Data Room document: WHO needs it, WHY,
--   WHAT they need to do, and WHETHER they have done it.
--
-- WHAT THIS IS NOT (deliberate)
--   · NOT a second document system. It references documents(id) only.
--   · NOT a second team system. The assignee is a profiles(id) who is ALREADY
--     authorized for the business through the existing membership structures
--     (see can_assign_document_to_profile below).
--   · NOT a permission grant. Assigning a document gives NO access the assignee
--     did not already have: Data Room documents are business-scoped, so an
--     assignable person could already read it. The migration §12 review found
--     no escalation — see src/DOCUMENT_ASSIGNMENTS_REPORT.md.
--   · NOT connected to extraction review. Completing an assignment here touches
--     NOTHING in extracted_fields / BIS. The two are separate systems.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- REVISION 2 — DATABASE SECURITY REVIEW (what changed at this boundary)
-- ═════════════════════════════════════════════════════════════════════════════
--   1. ASSIGNEE **AND** DOCUMENT/V BUSINESS ARE NOW VALIDATED AT THE DATABASE.
--      can_access_business(business_id) proves the ACTOR only — it derives
--      auth.uid() internally, so it can say nothing about an arbitrary
--      assignee_profile_id, and an actor who may access Business A could name a
--      foreign profile. INSERT/UPDATE are therefore validated by
--      public.can_assign_document_to_profile(), a SECURITY DEFINER companion to
--      the canonical function (same owner, same search_path discipline, and it
--      composes can_access_business() rather than replacing it). It also proves
--      the document belongs to that business — which no FK can do here, because
--      document_id is deliberately unconstrained (below).
--   2. DIRECT WRITE PRIVILEGES REMOVED. Every mutation in this app goes through
--      the service-role backend contract (base44/functions/documentAssignments);
--      no frontend code touches Supabase tables directly. So `authenticated`
--      keeps SELECT (RLS-scoped) and loses INSERT/UPDATE/DELETE/TRUNCATE, and
--      `anon` keeps nothing. This is NARROWER than the project-wide default ACL
--      (which grants arwdDxtm to anon/authenticated on business tables and
--      relies on RLS alone) and it is deliberate: "RLS must never be wrong" and
--      "there is also nothing to exploit" are different guarantees, and this
--      table can afford the second one.
--   3. AUDIT FOREIGN KEYS COMPLETED. completed_by_profile_id and
--      removed_by_profile_id now reference profiles(id) ON DELETE SET NULL,
--      matching the house convention for nullable audit columns
--      (business_dna_patterns.advisor_confirmed_by, next_best_actions.*), so
--      assignment history survives a profile deletion.
--   4. VERIFICATION QUERIES CORRECTED. The previous query omitted super_admin
--      and business_owners and would have reported legitimate rows as invalid.
--      They also avoid auth.uid()/is_super_admin() — both are meaningless in the
--      SQL Editor (auth.uid() is NULL there), which is exactly why they must not
--      be used to judge row validity.
--
-- REVIEWED AND DELIBERATELY UNCHANGED
--   · assignee_profile_id stays NOT NULL with ON DELETE CASCADE, the same
--     convention the other NOT NULL profile FKs use (bie_persistence,
--     saved_playbooks). Making an assignment outlive its assignee means making
--     the column nullable + SET NULL — a design decision, not a migration
--     detail, so it is left for explicit approval. (Change, if ever wanted:
--     `ALTER COLUMN assignee_profile_id DROP NOT NULL` + recreate the FK with
--     ON DELETE SET NULL.)
--   · The unique key stays (document_id, assignee_profile_id) — see the note at
--     the index. Adding business_id would WEAKEN it, not strengthen it.
--   · No updated_at trigger — the backend maintains updated_at on all three
--     write paths. See the note at the end of the file.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.document_assignments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Canonical business scope. Every read and write is authorized against this.
  business_id               UUID NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,

  -- The document, and the person it is assigned to (one row per person, so each
  -- assignee's status is independently trackable).
  -- document_id is deliberately NOT FK-constrained, the same choice
  -- resource_assignments makes: an assignment record must never be silently
  -- destroyed by a document delete. Consistency with business_id is enforced by
  -- can_assign_document_to_profile() below instead of by a constraint.
  document_id               UUID NOT NULL,
  assignee_profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- WHY (review | action_required | fyi) and WHETHER it is done.
  assignment_type           TEXT NOT NULL DEFAULT 'review'
                              CHECK (assignment_type IN ('review', 'action_required', 'fyi')),
  status                    TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'completed', 'removed')),
  note                      TEXT,

  -- Audit trail — who assigned it, who completed it, who removed it.
  assigned_by_profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at              TIMESTAMPTZ,
  completed_by_profile_id   UUID,
  removed_at                TIMESTAMPTZ,
  removed_by_profile_id     UUID,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── COMPLETE THE AUDIT FKs (idempotent) ─────────────────────────────────────
-- Nullable audit columns are constrained ON DELETE SET NULL: the person may
-- vanish, the record of what happened must not. (Rev 2, item 5.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_assignments_completed_by_fkey'
      AND conrelid = 'public.document_assignments'::regclass
  ) THEN
    ALTER TABLE public.document_assignments
      ADD CONSTRAINT document_assignments_completed_by_fkey
      FOREIGN KEY (completed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_assignments_removed_by_fkey'
      AND conrelid = 'public.document_assignments'::regclass
  ) THEN
    ALTER TABLE public.document_assignments
      ADD CONSTRAINT document_assignments_removed_by_fkey
      FOREIGN KEY (removed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── INDEXES ─────────────────────────────────────────────────────────────────
-- UNIQUE KEY DECISION (rev 2, item 4): kept as (document_id, assignee_profile_id).
-- A document belongs to exactly one business, so this is already tenancy-correct;
-- and it is STRICTLY STRICTER than (business_id, document_id, assignee_profile_id),
-- because the three-column form would ADMIT a second row for the same document and
-- person if business_id ever differed. Tenancy is made explicit by the business_id
-- column, the composite indexes below, and the policy's WITH CHECK — not by
-- loosening the identity of the assignment itself.
CREATE UNIQUE INDEX IF NOT EXISTS document_assignments_doc_assignee_key
  ON public.document_assignments (document_id, assignee_profile_id);

-- The Data Room's reads: everything in this business, one document's people,
-- everything assigned to one person.
CREATE INDEX IF NOT EXISTS idx_document_assignments_business
  ON public.document_assignments (business_id, status);
CREATE INDEX IF NOT EXISTS idx_document_assignments_business_document
  ON public.document_assignments (business_id, document_id);
CREATE INDEX IF NOT EXISTS idx_document_assignments_assignee
  ON public.document_assignments (assignee_profile_id, status);

-- ── ASSIGNEE + DOCUMENT VALIDATION (rev 2, items 1 & 3) ─────────────────────
-- The canonical rule, restated ONCE, parameterized by profile:
--   "may this document, in this business, be assigned to this person?"
-- It is deliberately the same shape and the same security posture as
-- public.can_access_business(): SECURITY DEFINER, owned by postgres (which holds
-- BYPASSRLS), search_path pinned, every table schema-qualified. It does not
-- replace or duplicate the actor rule — it calls it.
--
-- Membership sources mirror the backend roster exactly (business owner via
-- business_entities.profile_id, assigned advisor via assigned_advisor_id,
-- explicit ownership via business_owners, membership via business_team_members,
-- platform super_admin) so the database can never be STRICTER than the backend
-- and refuse a legitimate assignment. If the roster is ever widened (e.g. to
-- advisor_assignments or expert_advisor_access, neither of which the roster uses
-- today), this function must be widened in the same change.
--
-- The actor gate is inside the function on purpose: it keeps the function from
-- answering "is profile P in business B?" for a business the caller cannot reach.
CREATE OR REPLACE FUNCTION public.can_assign_document_to_profile(
  target_business_id uuid,
  target_document_id uuid,
  target_profile_id uuid
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    -- 1. The ACTOR must be able to reach this business (canonical rule).
    public.can_access_business(target_business_id)
    -- 2. The DOCUMENT must belong to THIS business. document_id has no FK by
    --    design, so this is where the business/document invariant is enforced.
    and exists (
      select 1
      from public.documents d
      where d.id = target_document_id
        and d.business_id = target_business_id
    )
    -- 3. The ASSIGNEE must be an authorized participant of THIS business.
    and (
      exists (
        select 1 from public.profiles p
        where p.id = target_profile_id
          and p.app_role = 'super_admin'
      )
      or exists (
        select 1 from public.business_entities b
        where b.id = target_business_id
          and (b.profile_id = target_profile_id or b.assigned_advisor_id = target_profile_id)
      )
      or exists (
        select 1 from public.business_owners o
        where o.business_id = target_business_id
          and o.profile_id = target_profile_id
      )
      or exists (
        select 1 from public.business_team_members tm
        where tm.business_id = target_business_id
          and tm.profile_id = target_profile_id
      )
    );
$function$;

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE public.document_assignments ENABLE ROW LEVEL SECURITY;

-- Rev 1 shipped a single FOR ALL policy: WITH CHECK (can_access_business(business_id)).
-- Drop it (harmless if absent) so a re-run over an earlier revision cannot leave
-- the weaker write rule in place alongside the new ones.
DROP POLICY IF EXISTS document_assignments_access_policy  ON public.document_assignments;
DROP POLICY IF EXISTS document_assignments_select_policy ON public.document_assignments;
DROP POLICY IF EXISTS document_assignments_insert_policy ON public.document_assignments;
DROP POLICY IF EXISTS document_assignments_update_policy ON public.document_assignments;

-- READ: unchanged canonical rule — the actor's reach into the business.
CREATE POLICY document_assignments_select_policy
  ON public.document_assignments
  FOR SELECT
  TO authenticated
  USING (public.can_access_business(business_id));

-- WRITE: the actor AND the assignee AND the document/business pair.
-- With direct write grants removed below, these two policies are defense in
-- depth: they are the rule that applies if write access is ever granted to an
-- RLS-governed role again, and they are the machine-readable statement of the
-- invariant in the meantime.
CREATE POLICY document_assignments_insert_policy
  ON public.document_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_assign_document_to_profile(business_id, document_id, assignee_profile_id));

CREATE POLICY document_assignments_update_policy
  ON public.document_assignments
  FOR UPDATE
  TO authenticated
  USING (public.can_access_business(business_id))
  WITH CHECK (public.can_assign_document_to_profile(business_id, document_id, assignee_profile_id));

-- No DELETE policy: nothing may delete an assignment. Removal is soft
-- (status = 'removed'), so history survives — see the grants below.

-- ── PRIVILEGES (rev 2, items 2 & 9) ─────────────────────────────────────────
-- THE ACTUAL RUNTIME WRITE PATH: base44/functions/documentAssignments, using the
-- service-role key, after authenticating the actor, resolving the active
-- business, proving the actor may manage it, and proving the assignee is in that
-- business's roster. The browser never writes this table (no frontend .from()
-- call exists anywhere in src/), so `authenticated` does not need write access —
-- and withholding it removes the whole "a crafted direct PostgREST request"
-- class of attack rather than relying on the policies being perfect.
--
-- Note: new tables in this project receive the default ACL
-- (anon/authenticated = arwdDxtm), so the REVOKEs are required, not decorative.
REVOKE ALL ON TABLE public.document_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.document_assignments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.document_assignments FROM authenticated;

GRANT SELECT ON TABLE public.document_assignments TO authenticated;
GRANT ALL    ON TABLE public.document_assignments TO service_role;

-- The validation function is callable only by the role that must evaluate it.
-- (Functions are EXECUTE-to-PUBLIC by default, so this REVOKE is required.)
REVOKE ALL ON FUNCTION public.can_assign_document_to_profile(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_assign_document_to_profile(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_assign_document_to_profile(uuid, uuid, uuid) TO authenticated;

-- ── VERIFY (read-only — run these after; each must return the stated result) ─
--
-- 1. RLS is on:
--      select relrowsecurity from pg_class
--       where oid = 'public.document_assignments'::regclass;            -- true
--
-- 2. The three policies exist and carry the intended rules:
--      select policyname, cmd, roles::text, coalesce(qual,'') as using_expr,
--             coalesce(with_check,'') as check_expr
--        from pg_policies
--       where schemaname = 'public' and tablename = 'document_assignments';
--    Expect: select → can_access_business(business_id)
--            insert/update → can_assign_document_to_profile(...)
--            no DELETE policy.
--
-- 3. Privileges are exactly: authenticated = SELECT only; anon = nothing.
--      select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
--        from information_schema.role_table_grants
--       where table_schema = 'public' and table_name = 'document_assignments'
--         and grantee in ('anon','authenticated','service_role')
--       group by grantee;
--    Expected: authenticated → SELECT | service_role → full | anon → (no row).
--
-- 4. NO FOREIGN-BUSINESS ASSIGNEES. Every legitimate membership case is
--    included — owner, assigned advisor, explicit ownership, team membership,
--    and platform super_admin — and super_admin is tested against
--    profiles.app_role DIRECTLY, never via is_super_admin(), which answers for
--    the CALLER (auth.uid() is NULL in the SQL Editor and would falsely report
--    a legitimate super-admin assignee as invalid). Must return 0.
--      select count(*) as foreign_assignees
--        from public.document_assignments a
--       where not (
--         exists (select 1 from public.profiles p
--                  where p.id = a.assignee_profile_id and p.app_role = 'super_admin')
--         or exists (select 1 from public.business_entities b
--                     where b.id = a.business_id
--                       and (b.profile_id = a.assignee_profile_id
--                            or b.assigned_advisor_id = a.assignee_profile_id))
--         or exists (select 1 from public.business_owners o
--                     where o.business_id = a.business_id
--                       and o.profile_id = a.assignee_profile_id)
--         or exists (select 1 from public.business_team_members tm
--                     where tm.business_id = a.business_id
--                       and tm.profile_id = a.assignee_profile_id)
--       );
--
-- 5. NO BUSINESS/DOCUMENT MISMATCHES (the invariant no FK can hold). Must be 0.
--      select count(*) as mismatched_documents
--        from public.document_assignments a
--        left join public.documents d on d.id = a.document_id
--       where d.id is null or d.business_id is distinct from a.business_id;
--
-- 6. COMPLETION / REMOVAL CONSISTENCY (informational — must be 0). The backend
--    maintains these invariants; this proves it:
--      select
--        count(*) filter (where status = 'completed' and completed_at is null) as completed_without_time,
--        count(*) filter (where status = 'removed'   and removed_at   is null) as removed_without_time,
--        count(*) filter (where status = 'open'      and completed_at is not null) as open_with_stale_completion
--        from public.document_assignments;
--
-- 7. Both audit FKs exist with SET NULL:
--      select conname, confdeltype from pg_constraint
--       where conrelid = 'public.document_assignments'::regclass
--         and conname in ('document_assignments_completed_by_fkey',
--                         'document_assignments_removed_by_fkey');   -- 'n' = SET NULL

-- ── updated_at ──────────────────────────────────────────────────────────────
-- No trigger is created here, and no new framework is introduced. This project
-- has no generic public updated_at trigger function (the only reusable one is
-- valuation.update_updated_at(), used by the valuation schema's tables), and the
-- backend sets updated_at explicitly on ALL THREE write paths:
--     assign  → upsert writes updated_at (and clears completion/removal fields)
--     setStatus → writes updated_at on both complete and reopen
--     remove  → writes updated_at with status = 'removed'
-- If a database-level guarantee is wanted later, the smallest correct change is
-- one trigger reusing the existing generic function (no new function):
--     CREATE TRIGGER trg_document_assignments_updated_at BEFORE UPDATE
--       ON public.document_assignments FOR EACH ROW
--       EXECUTE FUNCTION valuation.update_updated_at();

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS document_assignments_select_policy ON public.document_assignments;
-- DROP POLICY IF EXISTS document_assignments_insert_policy ON public.document_assignments;
-- DROP POLICY IF EXISTS document_assignments_update_policy ON public.document_assignments;
-- DROP FUNCTION IF EXISTS public.can_assign_document_to_profile(uuid, uuid, uuid);
-- DROP TABLE IF EXISTS public.document_assignments;