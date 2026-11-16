# VISION — REAL-TIME NOTIFICATION EXPERIENCE (assignment arrivals)

Status: **implemented, build-clean, NOT published.** No second notification
record, service, realtime architecture, table, team model, authorization model or
Galileo assistant.

This pass delivers **Part 4 in full** — the premium real-time arrival experience —
plus the arrival path that carries a notification into the exact document.
**Parts 1–3 and 5–7 (Galileo assignment intelligence + actions) are NOT in this
pass**; §2–§15, §30–§33 below state exactly what already exists for them, so the
next chunk is orchestration over contracts that are already authoritative.

---

## 18. Existing notification delivery architecture found

| Question | Answer |
| --- | --- |
| How does the bell learn about new notifications? | **Polling.** `NotificationBell` polled `notificationService.getUnreadCount` every 30 s; the full list is fetched (`getNotifications`, limit 50) when the dropdown opens. |
| Supabase Realtime? | **No.** There is no Realtime channel or entity subscription for notifications anywhere in the app. |
| App-level events / query invalidation? | **No.** Nothing announces a new notification to the UI. |
| Existing sound asset? | **None** — no `.wav`/`.mp3` anywhere in `src/` or the served root. |
| Existing sound preference? | **None.** `NotificationPreferences` has in-app/email/per-type toggles and no sound field. |

**Decision (per §22):** reuse the mechanism that exists — the bell's own poll — and
tighten its cadence rather than inventing a second realtime path. The same request
that keeps the badge honest now also answers "has anything genuinely new
appeared?". Interval: 30 s → **15 s** (one cheap indexed count per tick; the list
is fetched only when the count actually rises). No new backend action, no new
channel, no new record.

## 19. How genuinely new notifications are detected

`src/lib/notifications/notificationArrival.js` — `createArrivalTracker()`:

- holds a `Set` of every notification id it has ever seen, and a `seeded` flag;
- the **first pass only learns** — nothing "arrives" because the app opened;
- afterwards it returns only ids it has never seen **whose `created_date` is
  later than this session's start**;
- the tracker is **created per mount**, inside the polling effect.

Consequences, which are the whole point of §23:

| Situation | Behaviour |
| --- | --- |
| New assignment arrives | fires ✓ |
| Page refresh | new tracker → seeds → **no replay** ✓ |
| Component remount | new tracker → **no replay** ✓ |
| List refetched / bell opened | ids already seen → **no fire** ✓ |
| Old unread notices load | `created_date < mount` → **no fire** ✓ |
| Business switch | notifications are recipient-scoped, no new ids → **no fire** ✓ |

The guard is `NEWLY ARRIVED`, never `UNREAD EXISTS`.

Scope: `isAssignmentArrival()` — `notification_type === 'document_assigned'`. One
predicate, deliberately narrow (an achievement badge should not chime like a
colleague handing you work), and extensible in one line if Vision later wants
arrivals for other types.

## 20. Sound implementation

- **Asset:** `src/assets/notification-chime.wav` — 27 KB, 0.62 s, 22.05 kHz mono
  16-bit PCM, generated programmatically and owned by the app. A struck tone
  (G5 fundamental + quiet octave shimmer, D6 a beat later), 6 ms attack,
  exponential decay, normalized to a modest peak and given a 30 ms silent tail.
  Deliberately brief and unstartling: no alarm, ringtone, cartoon or stock effect.
- **No audio library** was added, and **nothing is fetched at runtime** from an
  external site — the file is bundled by Vite as an app asset.
- One shared `Audio` element, created lazily, `currentTime` reset before each
  play, volume 0.35.

## 21. Browser autoplay handling

`playArrivalChime()` swallows every failure: a rejected `play()` promise (autoplay
blocked before interaction) and any constructor/exception path are caught and
ignored. **The visual bubble is independent of the sound**, so a blocked chime
still delivers the notification, and once ordinary interaction permits audio the
same call simply starts working. Nothing is hacked around and nothing is primed.

## 27. The assigner never hears it

The notification record is created for the **recipient only**
(`notifyAssignees` resolves the Base44 user from the assignee's profile email and
`continue`s if there is none); the bell only ever fetches notifications where
`recipient_id = user.id`. The assigner therefore cannot receive their own action's
arrival event, and the chime fires only for records this user holds.

## 22. Toast / bubble implementation

`src/components/notifications/NotificationBubble.jsx`, rendered **inside the
bell's own relative container** (`NotificationBell`), so no new overlay system
and no interference with the global toaster.

- Compact glass card: `vision-glass-raised` + `vision-sheen` + gold hairline
  border, gold icon tile — Vision's existing surface language, not a generic toast.
- Content: "DOCUMENT ASSIGNED" eyebrow, the notification's own message
  (2-line clamp), the assignment-type pill from `metadata.assignment_type`
  (Review / Action Required / FYI), an "Open document →" affordance, and
  "+N more new assignments" when a queue is waiting. Never a mini document panel.
- One arrival at a time; the queue advances on dismiss or click (§33) — never a
  skyscraper of cards.

## 23. Toast positioning relative to the bell

`absolute right-0 top-full mt-3 w-[308px] z-[60]` — directly under the bell, in
the top-right of the Vision shell, so it reads as coming **from the bell**. It is
hidden while the dropdown is open (the owner is already looking at the list, and
the two would otherwise overlap).

## 24. Toast timing / fade

6 s visible. `framer-motion` entrance (`opacity 0→1`, `y -8→0`, `scale .985→1`,
240 ms ease-out) and exit (`opacity→0`, `y→-6`) inside the bell's
`AnimatePresence`. No bounce, no flashing, no aggressive movement. The dismiss
callback is held in a ref so the 15 s poll ticking in the parent can never restart
the timer and strand the bubble.

Hover **and** focus pause automatic dismissal (§32); leaving resumes it. Clicking
navigates immediately.

## 25. Multiple notifications

Queue, one at a time. Additional genuinely-new arrivals append to the queue; the
next shows when the current one is dismissed or clicked; the remainder is
summarised on the card ("+2 more new assignments in your notifications") and the
bell itself always has the full list.

## 26. Toast accessibility

The card is a real `<button>` (keyboard-focusable, Enter/Space activation) inside
`role="status"` + `aria-live="polite"`, so the arrival is announced without sound.
Sound is enhancement only — every piece of information on the card (who, what,
which type, how to open it) is visible text. Focus uses the existing
`vision-focus` ring.

## 29. Notification navigation reuse

The bubble calls the bell's **own `handleClick`** — the identical path a bell item
uses: `markRead` → `trackNotificationEvent('clicked')` →
`useNotificationNavigation` → `resolveNotificationDestination` → canonical
business switch → the exact document. **No separate toast navigation logic
exists**, so the bubble and the bell can never disagree about where a
notification goes.

## 28. Read/unread behaviour

Appearing does **not** mark anything read: the tracker, the toast and the poll
touch no record. Only a click runs `markRead`, exactly as the bell already did.
Auto-dismiss changes nothing.

## 37. Assignment updates vs. new assignments

The chime is driven by **new notification records**, never by
`document_assignments` writes. A status change, a note edit, a completion or a
reopen creates no notification and therefore makes no sound. A re-assignment
revives the same assignment row (upsert on `document_id,assignee_profile_id`) but
the backend *does* intentionally create a fresh notification for it — a new
hand-off is a real event, so it arrives once, with the same assignment id as
before.

---

## Parts 1–3, 5–7 — Galileo assignment intelligence and actions (next chunk)

Not started this pass, deliberately, rather than half-wired into the
conversational engine. What it needs is already in place and authoritative:

| Capability | Existing contract (no new writer, no new authorization) |
| --- | --- |
| Read | `documentAssignments.listForBusiness` — business-scoped, returns `me.can_manage` and decorated assignee/document names |
| Create | `documentAssignments.assign` — resolves document-in-business + roster membership + `validateBusinessScope`, upserts on `(document_id, assignee_profile_id)`, supports `note`, fires the (now deep-linked) notification |
| Status | `setStatus` — assignee-or-manager authorization; **FYI refused with 409**; reopen clears `completed_at` / `completed_by_profile_id` |
| Remove | `remove` — soft, `status='removed'` |
| Open | the document contract → `GalileoDocumentOverlay` → exact viewer by `document_id` |
| Arrival context | `notificationDestination` already yields `{ businessId, documentId, assignmentId, assignmentType }` |
| Prioritisation | the existing Next Best Move path (`nextBestMoveResolver` + `homeSignals`) |
| Conversation | `askGalileo` + the `base44/shared/galileo` executive/capability layer — **the audit that remains to be done before wiring** |

So the deferred work is: teach `askGalileo` (and the capability/context layer) the
assignment vocabulary (§2's five distinct concepts), add person/document
resolution against the active-business roster, and route writes through
confirmation → the existing `documentAssignments` actions. Nothing in this pass
blocks it, and nothing in this pass needs redoing for it.

## 36. Files changed

New:
- `src/lib/notifications/notificationArrival.js` — arrival tracker + chime player
- `src/components/notifications/NotificationBubble.jsx` — the bell-anchored card
- `src/assets/notification-chime.wav` — the one app-owned sound asset
- `src/REALTIME_NOTIFICATION_EXPERIENCE.md` (this report)

Edited:
- `src/components/notifications/NotificationBell.jsx` — arrival-aware poll (15 s,
  reusing the existing mechanism), arrival queue, and the bubble render.
  `getUnreadCount` now returns the count so the poll can compare.

## 37. Backend changes

**None.** No function was touched: `notificationService` and
`documentAssignments` are unchanged from the previous pass.

## 38. Database changes

**None.** No table, column, index or policy. `document_assignments` is untouched.

## 39. Build result

`npx vite build` → **exit 0**. The chime is emitted as a bundled asset
(`dist/assets/notification-chime-*.wav`, 27,386 bytes), proving the asset import
resolves in the production bundle.

## 40. Lint result

Clean on every file written or changed this pass. Two **pre-existing** issues
remain in `NotificationBell.jsx` (an unused `AlertCircle` import and an unused
`iconColor` variable, both present before this work) — left alone deliberately.

## 41. Runtime tests performed

- Production build (exit 0) + asset emission verified.
- Static trace of the arrival path: poll → count increase → `getNotifications`
  (limit 8) → tracker diff → `isAssignmentArrival` → queue + chime → bubble →
  click → `handleClick` → resolver → business switch → exact document.
- Static trace of the replay guards: mount seed, `created_date > mount` check,
  per-mount tracker, no diff on the open-fetch.

## 42. Browser tests performed

None — I cannot drive a browser. These are the checks to run in the preview.

## 43. Manual checks remaining

- G. Assign a document to another account → exactly one notification, one sound.
- H. The sound is subtle and brief, and audible after any interaction with the page.
- I. The bubble appears under the bell, top-right.
- J. The **assigner** hears nothing.
- K. The bubble fades on its own (~6 s) and pauses while hovered/focused.
- L. Clicking the bubble → same resolver → correct business → exact document.
- M. The bubble appearing does **not** mark the notification read in the bell.
- N. Clicking the bubble does mark it read, exactly like a bell item.
- O/P. Refresh and remount → no replay.
- Q. Two assignments in quick succession → one card, then the next, with the
  "+N more" line.
- R. With audio blocked (or before any interaction), the bubble still appears and
  no error surfaces.

## 44. Deferred, and why

Galileo assignment intelligence and actions (Parts 1–3, 5–7, items 4–17, 29–33 and
38–45 of the request). Deferred as one coherent next chunk on purpose: it belongs
inside the conversational engine (`askGalileo` + the Galileo capability layer),
which deserves an audit of its own rather than a rushed edit — and every contract
it needs is already live and unchanged.

**Not published. Phase 6C not begun.**