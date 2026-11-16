# VISION — DATA ROOM DOCUMENT INTERACTION + NOTIFICATION DEEP-LINK CLOSEOUT

Status: **implemented, build-clean, NOT published.** No new viewer, no new Data
Room, no new notification system, no assignment-architecture change, no Phase 6C.

Parts 1–4 are done. **Parts 5–8 (Galileo assignment intelligence) are NOT in this
pass** — see §11–§25, which state what already exists and what is deferred.

---

## 1. Frozen Actions column

Presentation only; what the actions DO is untouched.

- The table now scrolls inside its own region (`overflow-x-auto`) and the table
  itself keeps a floor width (`min-w-[980px]`), so metadata genuinely moves
  underneath instead of every column compressing to fit.
- The Actions **header** cell and the Actions **body** cell are both
  `sticky right-0` — the header at `z-20`, the body at `z-10` — so header and
  rows stay aligned at the right edge while the metadata scrolls.
- Each carries an **opaque surface** (`bg-card`) so text passing beneath cannot
  bleed through, plus one **hairline** left border (`border-l border-border/40`).
  No divider bars, no shadows, no extra table chrome; the Vision glass wrapper is
  unchanged.
- Mobile: the same region scrolls horizontally with the same pinned column.
  Nothing is hidden and no control becomes unreachable.

## 2. Row click

Every document row carries `onClick={() => handleRowOpen(doc)}`.
`handleRowOpen` → the existing `handleOpenDocument(doc)`:

- inside the Galileo overlay → `onOpenLayer('data-room', doc.id)` (the viewer as
  a LEVEL of the existing stack);
- on the standalone route → `openDocumentViewer(doc)` (the existing viewer).

No new viewer, no legacy document page, and the owner never has to find an
Actions control to open a document. Rows read as clickable (`cursor-pointer`;
`cursor-grab` is retained where dragging is allowed, since that is still the drag
affordance).

## 3. Event propagation

- The **Actions cell** stops propagation at the cell: a click on Retry, Flag,
  Delete/Confirm or Cancel performs that action and never opens the document.
- The **assignment indicator** in the document cell stops propagation before
  opening the assign panel — it is its own action.
- **Drag vs click**: a drag ends by firing a click. `suppressRowClickRef` is set
  on `onDragStart` and cleared on the next tick after `onDragEnd`, so dropping a
  document into a folder can never also open it.
- No double navigation exists: one click resolves to exactly one destination.

## 4. Exact document

Every row opens by **authoritative document id** — never a filename, never a
title match. `onOpenLayer('data-room', doc.id)` and `openDocumentViewer(doc)`
both carry the row's id, and the viewer's URL comes from that record.

The authorization is unchanged and still fail-closed: the Data Room opens a
requested id only if it is present in the **active business's own document
list**, which the backend resolves and scopes. Two documents with the same name
are two distinct ids and the requested one opens. A foreign id never appears in
that list, so it never opens.

## 5. Existing notification architecture (audited, then reused)

| Piece | What it is |
| --- | --- |
| Schema | `Notification` entity: `recipient_id`, `recipient_profile_id`, `sender_id`, `business_id`, `notification_type`, `notification_category`, `title`, `message`, `related_entity_type`, `related_entity_id`, `action_url`, `metadata`, `is_read`, `read_at`, `opened_at`, `clicked_at`, `dismissed_at`, `completed_action_at`, `priority` |
| Creation | `notificationService` → `createNotification` (preference-aware; optional email from the same service). Producers: `documentAssignments`, `ninetyDaySprint`, `assignSprintVerifier`, `assignWorksheetToUser`, `achievementNotifications`, `teamInvites`, `weeklyUpdate`, `notifyAdminsNewUser`, `DocumentRequests` |
| Click handler | **exactly one**: `NotificationBell.handleClick` → `markRead` → `trackNotificationEvent('clicked')` → `navigate(action_url)` |
| Read/unread | `is_read` + `read_at` via `markNotificationRead` / `markAllNotificationsRead` (unchanged) |
| Business on the record | `business_id` — **already populated** by assignment notifications |
| Document on the record | `related_entity_type: 'Document'` + `related_entity_id: <documents.id>` — **already populated** |
| Assignment on the record | **was missing** → now persisted (see §7) |
| Assignee on the record | `recipient_profile_id` (present, and deliberately *not* used for navigation) |
| Notification route/centre | **does not exist** — the bell dropdown is the only surface |

No notification v2. One resolver, one hook, and the existing service, entity and
read/unread behaviour are reused as they are.

## 6. Notification destination resolver

`src/lib/notifications/notificationDestination.js` — the only place that decides
where a notification goes:

```
resolveNotificationDestination(notification)
  → { kind: 'document', businessId, documentId, assignmentId, assignmentType, review }
  → { kind: 'path', businessId, path }      // existing action_url, unchanged
  → { kind: 'none', businessId }
```

- `destinationUrl()` emits the document contract's own layer grammar:
  `?workspace=data-room&id=<documentId>&from=data-room` (plus `&tab=review` only
  when the notice explicitly declares the extraction-review context).
- **IDs are navigation, text is presentation.** The resolver reads `business_id`,
  `related_entity_id`, and the ids in `metadata`. It never reads the title, the
  message, a filename or a person's name, and it never does fuzzy matching.
- `src/hooks/useNotificationNavigation.js` executes the destination and is the
  single entry point the bell calls. No component contains an
  `if (notification.type === …)` ladder.

## 7. Assignment notification metadata

Before: `business_id` ✓, `related_entity_type: 'Document'` ✓,
`related_entity_id: <document id>` ✓, `action_url: '/galileo'` ✗ coarse, no
assignment id ✗.

After (smallest additive change):

- `action_url` → the exact deep link
  (`/galileo?workspace=data-room&from=data-room&id=<documentId>`), so even a
  consumer that only understands `action_url` lands on the exact document.
- `metadata` → `{ kind: 'document_assignment', document_id, assignment_id,
  business_id, assignment_type }`.
- `notificationService.createNotification` now persists `metadata` (the entity
  field already existed; the create path simply did not pass it through). This is
  additive — notice types that pass nothing keep landing on their `action_url`.
- `assignment_id` comes from the upsert's own returned rows, so it is the real
  row id (and a re-assignment revives the same row, so the id stays true).

## 8. Cross-business behavior

`useNotificationNavigation`:

1. reads the notice's `business_id`;
2. if it differs from the canonical active business, verifies the account
   actually holds it (`allBusinesses`); if not → **nothing opens** and a calm
   message is shown;
3. switches through the canonical `setActiveContext({ type: 'business', … })`;
4. **waits** for `activeContext.businessId` to report the target (60 ms poll,
   3 s ceiling) — the canonical context, not a guess;
5. only then navigates to the exact document.

Never `primary_business_id`, never the outgoing business, never a cross-business
leak. The Vision workspace layer already collapses its trail on a business
change, so no level of the previous business survives the switch.

## 9. Deleted / unavailable document

The Data Room's requested-document effect fails closed: the id is only opened if
it is in this business's own list. Otherwise nothing opens, the request is
cleared from the URL (a refresh cannot retry it), and
`DocumentUnavailableNotice` states it calmly —

> **This document is no longer available.**
> It may have been removed, or it may not belong to this business.
> [ Back to Data Room ]

Deliberately the same sentence for a deleted document and a foreign one: naming
which would leak whether a document exists in another business. Back returns to
the library, which is already on screen.

## 10. Back-navigation behavior

The layer mechanics were not touched.

- **Notification → Document**: the deep link carries `from=data-room`, so the
  trail is `[Data Room, Document]` and **Back walks to the Data Room library**
  with the overlay still open — the owner is not ejected out of Vision, and the
  viewer closing is one step back, not an exit.
- If another workspace was open when the notification was clicked, the notice
  opens as a contextual entry (Back then closes the overlay onto the Vision
  surface the bell belongs to) — never to Home by accident.
- **Data Room → Document / Upload / Review → Back → Data Room**: unchanged.
- **Galileo / What If / Sprint → document → Back → origin**: unchanged.

---

## Parts 5–8 — Galileo assignment intelligence (NOT in this pass)

Deferred deliberately, in one chunk, rather than half-built. Nothing was changed
in a way that blocks it, and the pieces it needs already exist:

| Need | Already present |
| --- | --- |
| Read | `documentAssignments.listForBusiness` (business-scoped, `me.can_manage`, decorated names) |
| Write | `documentAssignments.assign` — the same contract the Data Room uses; resolves document-in-business + roster + `validateBusinessScope` |
| Status | `setStatus` — assignee-or-manager authorization; **FYI refused with 409** |
| Remove | `remove` — soft, `status='removed'` |
| Duplicates | upsert on `document_id,assignee_profile_id` — cannot create a second row |
| Open | the document contract → Galileo document overlay → exact document |
| Notification | the same `documentAssignments` notification path, now deep-linked |

So §11–§23 of the request (Galileo read access, person/document resolution,
contextual "this", confirmation-before-write, "Assigned to Me" conversation, Next
Best Move candidates) are the **next chunk**, built on these contracts with no
new writer and no new authorization model.

## 24. Notification security

- Navigation reads authoritative ids only; a forged `metadata` can, at most,
  request a document id — which is then validated against the active business's
  own list exactly as a hand-typed deep link is. Forged metadata therefore cannot
  expose a foreign document.
- A forged `business_id` can only cause a switch to a business the account
  genuinely holds; otherwise nothing opens.
- The notification's own RLS is unchanged (a recipient reads only their own;
  creation is admin/service-role).
- `markRead` and the `clicked` analytics event keep their existing ownership
  checks; a failed navigation does not fabricate a success state.

## 25. Cross-business security

- `document_assignments`: `authenticated` = SELECT only, `anon` = none,
  `service_role` = writer; RLS `can_access_business(business_id)`. Unchanged.
- The `documentAssignments` backend refuses to guess scope: probing it with no
  explicit business returned *"active business_id is required … this account owns
  3 businesses, so primary_business_id is ambiguous and must not be substituted
  for an explicit selection"* — the contract will not silently pick a business.
- Business switch is bounded by the businesses the account actually holds.
- The Data Room, the notification resolver, and the assignment contract all
  converge on the same authoritative business scope.

## 26. Files changed

New:
- `src/lib/notifications/notificationDestination.js`
- `src/hooks/useNotificationNavigation.js`
- `src/components/dataroom/DocumentUnavailableNotice.jsx`
- `src/DOCUMENT_INTERACTION_NOTIFICATION_CLOSEOUT.md` (this report)

Edited:
- `src/pages/DataRoom.jsx` — scroll region + frozen Actions column, row click,
  propagation handling, drag/click suppression, unavailable-document state and
  notice.
- `src/components/notifications/NotificationBell.jsx` — click routed through the
  one resolver/hook instead of a bare `navigate(action_url)`.
- `base44/functions/notificationService/entry.ts` — persist `metadata` (additive).
- `base44/functions/documentAssignments/entry.ts` — exact deep link + assignment
  metadata on the assignment notification.

## 27. Build result

`npx vite build` → **exit 0**, no errors.

## 28. Lint result

Clean on every file written or changed this pass. Pre-existing issues remain in
files that were not touched (4 unused-import errors in
`ClassificationReviewQueue.jsx` / `SystemFolderPanel.jsx`; an unused `AlertCircle`
import in `NotificationBell.jsx` that predates this change) — left alone.

## 29. Runtime tests performed

- Production build (exit 0).
- **Load/parse probes** on both edited backend functions: `documentAssignments`
  and `notificationService` each executed and returned their own domain
  responses (`active business_id is required…`, `Unknown action: …`) — proving
  both compiled and run, with no writes performed (the probe action is not a
  mutation path).
- Static end-to-end trace of the click path: bell → resolver → business switch →
  `navigate(destinationUrl)` → Data Room requested-document effect → viewer or
  fail-closed notice.

## 30. Manual browser checks remaining

I cannot drive a browser, so these are the checks to run in the preview:

- A. Data Room horizontal scroll → Actions stays frozen and legible.
- B. Click a document row → the exact document opens in the existing viewer.
- C. Click Retry / Flag / Delete / Assign inside a row → that action only.
- D. Two same-name documents → the clicked one opens.
- E. Assignment notification → correct business → Data Room → exact document.
- F. Notification for an inactive business → switch first → exact document.
- G. Notification for a removed document → "no longer available" + Back.
- H. Back from a notification-opened document → Data Room library.
- I. Data Room → document → Back → Data Room (unchanged).
- J. Galileo / What If / Sprint → document → Back → same origin (unchanged).

**Not published. Phase 6C not begun.**