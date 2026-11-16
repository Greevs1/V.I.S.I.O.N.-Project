# V.I.S.I.O.N. — DOCUMENT ASSIGNMENTS + TEAM COLLABORATION

Status: **core built, verified statically. NOT published. Phase 6C not started.**

> **ONE MANUAL STEP BEFORE IT WORKS.** The new table has not been created: the build
> tools have read-only Supabase access and the project is shared, so — as with every
> schema change in this repo — the migration is run deliberately by a human:
> `src/supabase/migrations/document_assignments.sql` → Supabase SQL Editor. It is
> idempotent and ends with verification queries. Until it is run, the Data Room shows
> no assignment UI beyond a silent no-op (the backend refuses cleanly).

---

## 1. Existing team / member architecture found

Supabase is the system of record. There is **no TeamMember model to invent — it already
exists**:

| Concept | Authoritative structure |
| --- | --- |
| Business | `business_entities` — `id`, `business_name`, `profile_id` (the OWNER), `assigned_advisor_id`. Every business FK in the schema targets this table; `businesses` is legacy. |
| Business owner | `business_entities.profile_id`, plus explicit ownership rows in `business_owners` (`ownership_role`, `end_date`). |
| **Team member / membership** | **`business_team_members` (`business_id`, `profile_id`)** — this is how more than one user already shares a business. |
| Advisor / expert | `business_entities.assigned_advisor_id`, `advisor_assignments` (with `status` / revocation), `expert_advisor_access`. |
| User / profile | `profiles` (`id`, `base44_user_id` — the verified Base44 bridge, `email`, `first_name`, `last_name`, `app_role`, `primary_business_id`, membership tier/status). |
| Roles that exist | `profiles.app_role` ∈ super_admin, admin, advisor, expert_advisor, owner, team_member, user; Base44 `User.role` ∈ admin, user. **No role names invented.** |
| Permissions | `UserPermission` (base44 entity) — per-user feature flags for advisor-facing surfaces, including `data_room`. |
| Notifications | `Notification` (base44 entity) + `notificationService` — preference-aware, in-app, optional email. |

Answers to §1's questions: membership is `business_team_members`; **multiple users already
access the same business** (that is what the table is for); roles come from `profiles.app_role`;
and the protecting rule is the one below.

## 2. Existing authorization model

One shared rule, live in the database as **`public.can_access_business(business_id uuid)`**:

```
owner   → business_entities.profile_id = auth.uid()
advisor → business_entities.assigned_advisor_id = auth.uid()
admin   → is_super_admin()
member  → business_team_members(business_id, profile_id = auth.uid())
```

Business-owned tables (documents included) carry RLS policies using exactly that function.
Server-side, `shared/businessScope/writeGuard.ts#validateBusinessScope` **mirrors** the rule
(and additionally honours `business_owners`, `advisor_assignments`, `expert_advisor_access`),
while `shared/authz/actor.ts` (Phase 6) enforces the sequence
*authenticate → identify actor → authorize → resolve resource → service-role write* with
identity taken from the session only. Business context is resolved by
`resolveActiveBusiness`, which **refuses** an ambiguous multi-business request rather than
substituting `primary_business_id`.

## 3. Was a new table necessary?

**Yes — exactly one, and nothing else.** Audited and rejected as duplicates:

- `resource_assignments` — the Resource Library sharing table (admin-only writer, no
  purpose/type, no status, no completion, resource-scoped).
- `worksheet_assignments` — the worksheet system.
- `DocumentRequest` (base44 entity, already a Data Room tab) — asks a person to **supply** a
  document: the opposite direction, and it stays separate.
- `SprintTaskDocument` — links a Sprint task to a document (execution, not collaboration).
- `Notification` — delivery, not state.

So: **one new Supabase table, `document_assignments`.** No second document system, no second
team system, no new role names.

## 4. Assignment schema / relationship

`document_assignments`: `business_id` (UUID, FK → `business_entities.id`, ON DELETE CASCADE) ·
`document_id` (UUID) · `assignee_profile_id` (UUID, FK → `profiles.id`) · `assignment_type`
(`review` | `action_required` | `fyi`) · `status` (`open` | `completed` | `removed`) · `note` ·
`assigned_by_profile_id` · `assigned_at` · `completed_at` · `completed_by_profile_id` ·
`removed_at` · `removed_by_profile_id` · timestamps.

One row per document per person (unique index), so **each assignee's status is independently
trackable** (§5). Removal is **soft** — history is never physically deleted (§20/§28).
`document_id` is deliberately not FK-constrained, exactly as `resource_assignments` does it,
so a document delete can never silently destroy an assignment's audit trail.

## 5. RLS / security implementation

- RLS **enabled**; one `FOR ALL` policy `USING (can_access_business(business_id)) WITH CHECK
  (can_access_business(business_id))` — mirroring `galileo_conversations_access_policy`. It
  invents neither a weaker nor a broader rule. Grants to `authenticated` included.
- The migration carries its own verification queries (RLS on; policy present; a
  cross-business orphan check that must return 0).
- **The service-role backend authorizes itself** (service role is capability, not
  authorization): `business_id` comes from the *resolved* context, never the body; the
  document is checked against its own row; the assignee is proved with
  `validateBusinessScope`; every update/remove is addressed **with** the business filter, so a
  forged `assignment_id` from another business is a 404, not a write.
- §12 verdict: **no permission escalation and no STOP condition.** Data Room documents are
  business-scoped, so anyone who can be assigned one could already read it. Assignment grants
  nothing new; the backend refuses any assignee who is not *already* authorized.

## 6. Who may assign

Derived from the existing rule, not invented: **owner** (`business_entities.profile_id` or a
`business_owners` row), **assigned advisor**, an `advisor_assignments` holder, and platform
**admin/super_admin**. Team members and experts get read + complete-their-own only (assign
returns 403). The backend returns `can_manage`; the UI only reflects it — a team member sees a
plain sentence where the picker would be.

## 7. Assignment types implemented

Exactly three, no workflow engine: **Review**, **Action Required**, **FYI**.

## 8. Multiple-assignee behaviour

One row per person, written in a single call; each keeps its own type, status, note and
completion. Sarah can be *Completed* while Mike is still *Open*.

## 9. "Assigned to Me" behaviour

A **tab inside the Data Room** (not an application), offered only when the backend resolved a
member profile for the active business, with a live count. Each row: document, purpose,
status, who assigned it, when, and the note. Clicking a row opens the **exact existing
document in the existing viewer** — and because that viewer is a level of the overlay's stack,
Back returns to the list, then to the repository. Empty state is verbatim §29: *"Nothing
waiting on you. When someone assigns you a document, it will show up here."* A row whose
document is no longer in the business's list is listed but **not openable** — an old
assignment never resurrects revoked access.

## 10. Completion behaviour

Review / Action Required: the assignee (or a manager) marks **complete**, and can **reopen**.
FYI: **no completion at all** — there is no reliable "seen" signal in this system and none was
faked.

## 11. Document list indicators

A restrained second line on the document name: **"Assigned to Sarah +2"** with a Users icon,
rendered **only** when a document actually has assignments; clicking it opens the panel
(who / type / status, and management). Ordinary rows are untouched. No cards, no kanban, no
giant tables.

## 12. Viewer assignment UI

An **"Assigned to"** block in the existing viewer's metadata sidebar, supplied through one
optional slot — the document stays primary and every other viewer usage is unchanged. It lists
each assignee with purpose and status, offers Complete on open review/action items, and
**Manage** opens the assign panel.

## 13. Galileo read / query behaviour

**Deferred, and reported rather than faked.** The records are the authoritative source and are
business-scoped, so the remaining work is a compact assignment block injected into
`askGalileo`'s context. Not touched this turn.

## 14. Galileo assignment action behaviour

**Deferred.** There is no second assignment path to build: a future Galileo action calls the
same `documentAssignments` contract. Safe action confirmation in the chat path does not exist
yet, so per §16 this is reported, not faked.

## 15. Notifications available / deferred

The platform **already has** a real notification system, so §17's "YES" branch applies:
assignment fires **`document_assigned`** through the existing `notificationService` (which
honours the recipient's preferences), recipient resolved to a platform account — skipped
cleanly for someone who has not joined yet. One enum value + two mapping lines were added; it
reuses the existing "Document requests" preference, so **no new preference field or settings
UI** was invented. Delivery is best-effort and non-blocking; no email or push claim is made
beyond whatever that service already does.

## 16. Navigation behaviour

The assign panel is **local state: no URL change, no level.** Data Room → document → Assign →
close → the same document → Back → Data Room; contextual (Galileo source document) → Assign →
close → the same document → Back → the originating context. **Escape closes only the panel**
(a capture-phase handler stops it reaching the viewer and the workspace shell beneath). Last
turn's back-navigation fix is intact — the change here only passes props.

## 17. Business isolation results (static)

`business_id` always comes from the resolved context; the assignee must pass the business guard
*and* be present in the roster derived from that business's own membership rows; reads filter by
`business_id`; updates address the row with the business filter; RLS is defense in depth. A
**business-less document (profile/household scope) is refused with 409** rather than guessed
into a business — deliberate, fail-closed, and reported.

## 18. Removed-member behaviour

Authorization is re-evaluated on **every** call (the guard and the roster read membership
live), so removing a team member immediately ends their reach into that Data Room; the old
assignment row never re-grants anything, because the document is only reachable through a
document list they can no longer read. The row survives as history for the owner.

## 19. Files changed

New — `src/supabase/migrations/document_assignments.sql` · `base44/functions/documentAssignments/entry.ts`
(one contract: roster, listForBusiness, forDocument, listMine, assign, setStatus, remove) ·
`src/lib/documentAssignments.js` · `src/components/dataroom/AssignDocumentSheet.jsx` ·
`src/components/dataroom/DocumentAssignments.jsx` · `src/components/dataroom/AssignedToMe.jsx`.
Changed — `src/pages/DataRoom.jsx` (call, indicator, view, panel, viewer slot) ·
`src/components/documents/DocumentViewer.jsx` (optional collaboration slot) ·
`base44/entities/Notification.jsonc` (one enum value) · `base44/functions/notificationService/entry.ts` (two mapping lines).

## 20. Build / lint

`vite build` → **exit 0**. `eslint` over every changed and new file → **0 errors** (one
pre-existing unused import in the viewer was cleared while touching that file; one pre-existing
redundant-directive warning in the Data Room remains, untouched). The backend function is not
covered by the frontend eslint config.

## 21. Runtime tests performed

**None against live data, and this is the honest answer.** The Supabase connector this
environment holds is read-only (`projects:read`, `secrets:read`, `database:read`), the project
is shared, and the migration is deliberately human-run — so no assignment has been written or
read end to end. What was verified: the build, lint, the authorization sequence by code
inspection, the write-target audit (only `document_assignments` is written), and the deliberate
absence of any extraction/BIS coupling. §31's matrix is **not** runtime-verified.

## 22. Manual browser checks remaining

After applying the migration, with two accounts on one business (owner + invited team member):

1. **A** Owner opens a document → Assign → the real roster appears (no one from another business).
2. **B** Assign Sarah / Review → persists (reopen the panel; the row is there).
3. **C** Sarah signs in → Data Room → **Assigned to Me** → the document is listed, with who assigned it.
4. **D** Sarah clicks the row → the **exact existing viewer** (not a copy), with the "Assigned to" block.
5. **E** Sarah marks it complete → status updates for her.
6. **F** Mike's separate assignment stays **Open**.
7. **G** Owner removes an assignment → it disappears from the list/indicator (recoverable as history).
8. **H** Data Room → document → Assign → close → **same document** → Back → **Data Room**.
9. **I** Galileo source document → Assign → close → same document → Back → **same Galileo context**.
10. **J** Assigning a member of Business B is refused (they are not in the roster; the API answers 403).
11. **K/L/M** Signed in as Business B: no Business A assignments are readable; a forged document id and a forged assignment id both fail closed.
12. **N** Remove the team member → they can no longer reach the Data Room or their assignment.
13. **O/P** (deferred with §13) Galileo answering "Who is assigned to this document?" / "What is assigned to me?"

---

## ADDENDUM — DATABASE SECURITY REVIEW (pre-execution audit, Revision 2)

Audited against the LIVE schema (read-only Management API queries), not from memory.

**Facts that drove the revision**

- `public.can_access_business(uuid)` is `SECURITY DEFINER` and resolves **auth.uid()** internally
  (owner `business_entities.profile_id`, assigned advisor `assigned_advisor_id`,
  `is_super_admin()`, or `business_team_members`). It validates the **actor only** — an actor who
  can reach Business A could name a foreign `assignee_profile_id`. Concern confirmed.
- `business_owners` is **not** part of that DB rule, although the server guard and the assignment
  roster both use it. The new validation function includes it so the database can never be
  stricter than the backend.
- `advisor_assignments` **does not exist** in this database (the server guard's step 5 is inert);
  the roster correctly does not depend on it.
- `profiles` has row-level RLS (`id = auth.uid() OR is_super_admin() OR assigned_advisor_id = auth.uid()`).
  An inline policy predicate would therefore have been **filtered** — which is why the membership
  check must live in a `SECURITY DEFINER` function, exactly as the canonical rule does. `postgres`
  (the definer, and the owner of `can_access_business`) holds `BYPASSRLS`.
- The project-wide ACL grants `arwdDxtm` to `anon`/`authenticated` on business tables and relies on
  RLS alone; no frontend code performs direct `.from()` table access. The write path is entirely
  backend-mediated.

**Decisions**

| # | Item | Decision |
| --- | --- | --- |
| 1 | Foreign assignee | Now rejected at the DB boundary by `can_assign_document_to_profile`, which composes `can_access_business` (actor) + document/business pair + assignee membership |
| 2 | Direct writes | Runtime writes are **backend-only**; `authenticated` loses INSERT/UPDATE/DELETE, keeps SELECT |
| 3 | Business/document mismatch | Enforced by the same function's `documents` check. A composite FK was rejected: it would need a unique index on `documents(id, business_id)` and would then block document deletion (NO ACTION) or destroy history (CASCADE) |
| 4 | Unique key | Kept `(document_id, assignee_profile_id)` — strictly stronger; added a `(business_id, document_id)` index |
| 5 | Audit FKs | `completed_by`/`removed_by` now → `profiles(id) ON DELETE SET NULL` |
| 6 | `updated_at` | Verified: backend writes it on all three mutation paths; no trigger, no new framework (one-line reuse of `valuation.update_updated_at()` documented as opt-in) |
| 7 | Completion consistency | Verified in the backend (complete sets both fields, reopen clears them, re-assign clears completion/removal, remove stamps `removed_at`); no CHECK constraints added |
| 8 | FYI | Confirmed no "seen"/"completed" state on open. **One backend change**: `setStatus` now refuses FYI (409) so the invariant does not depend on the UI hiding the button |
| 9 | DELETE grant | Revoked from `authenticated`; no runtime path deletes (removal is soft) |
| 10 | Assignee CASCADE | Left as-is (matches the NOT NULL house convention). Whether profiles are ever deleted: no runtime path deletes a profile; the SET NULL alternative requires a nullable column and is left for explicit approval |
| 11 | Verification query | Corrected — adds `super_admin` (via `profiles.app_role`, never `is_super_admin()`) and `business_owners`; plus mismatch and consistency checks |
| 12 | Backend change | Only the FYI guard; the `onConflict: 'document_id,assignee_profile_id'` upsert target is unchanged, so the hardened migration stays compatible |