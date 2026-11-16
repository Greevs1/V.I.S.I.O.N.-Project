# V.I.S.I.O.N. — DATA ROOM INTERNAL BACK NAVIGATION

Status: **fixed, verified statically. NOT published. Phase 6C not started.**

Scope honoured: no Data Room redesign, no change to document storage, extraction,
review, viewer, BIS, `openDocument` security, Galileo, or routing architecture. One
reserved query param (`from`) was added to the layer's own URL grammar — the same
mechanism `mode` / `needs` / `tab` already used — so the stack survives a refresh and
stays in step with the browser's Back button.

---

## 1. Root cause

The Data Room's internal controls changed the URL **without telling the navigation
layer**, and the layer only modelled one level (the workspace id).

Concretely, `DataRoom.jsx` called `useOpenDocuments()` with **no layer handle**, so
"Upload documents" navigated to `?workspace=data-room&mode=upload` — a `navigate()`
push that never pushed a level. The layer's trail reconciliation compared only the
workspace id, saw `data-room` = `data-room`, and returned early, leaving a **single
level**. `canGoBack` was therefore `false`, and `GalileoReimagined` hands that case
`onBack={onClose}` — so the header's control read **"Vision"** and its one action was
**Close**. Upload, the viewer and the Review tab all looked like the room's root, and
Back threw the owner out of the overlay to Home.

The same hole applied to every writer outside the hook: the document contract
(`useOpenDocument` / `useOpenDocuments`), `GalileoBadge`, `RecentDocuments`,
`ExtractedFieldsReviewQueue`, `DataRequirementOverlay`, `BusinessValuation`,
`Dashboard` — none of them told the layer where the request came from.

## 2. Existing navigation state reused

Nothing new was invented. The layer's own in-memory trail and the URL grammar it
already owned were extended, in three places:

1. **A level is now a workspace + a sub-view.** A trail entry gained a signature over
   the params that *are* a sub-view — `id`, `mode`, `tab`. `Data Room` and
   `Data Room → Upload` are now two different levels of the same trail.
2. **A level records its origin: `from`.** `open()` sets `from` to the room it is
   opening from; the document contract does the same when it changes the URL on its
   own. Back reads it. Contextual entry records **no** origin — which is precisely why
   What If → Upload → Back returns to What If.
3. **`replace()` — one new method on the existing layer object.** It swaps the current
   level in place (upload → review) so the stack does not grow a level the owner has
   already finished with. `open` / `back` / `close` are otherwise unchanged in shape.

Reconciliation stayed the same idea (the URL is the authority) with two more cases: a
sibling sub-view of the same room replaces the sub-view it superseded, and an entry
carrying `from` re-seeds the room it came from after a refresh.

The sub-view params are also cleared by `open` / `back` / `close`, which removes a
pre-existing leak: a stale `mode=upload` could previously survive into a later open of
the same workspace.

## 3. Data Room → Upload → Back

`?workspace=data-room&mode=upload&from=data-room` → trail `[Data Room, Upload]`.
Header reads **← Data Room**; clicking it clears the sub-view params, returns the URL
to `?workspace=data-room`, and the overlay stays open on the repository. ✓

## 4. Data Room → Viewer → Back

The row preview pushes a level through the contract's own shape
(`&id=<documentId>&from=data-room`). Back (and the viewer's own close, which now takes
exactly the same step) clears the id, closes the viewer and leaves the repository on
screen. A document opened from the Review list behaves the same way — the viewer level
replaces the review level, so Back means the Data Room, per the specified rule. Failed
lookups are untouched: the id is still a request against the active business's own
list, and an unknown one fails closed with the toast. ✓

## 5. Data Room → Review → Back

The tab bar (Review, Classification, Requests) now opens a level; the room's root is
the library, which carries no `tab` at all. Header reads **← Data Room**; Back returns
to the library. Tapping the tab you are already on opens nothing. ✓

## 6. Contextual Upload → Back

What If → Upload financials → `?workspace=data-room&mode=upload` with **no origin**:
a single level. The header reads **← What If** and Back means Close — the layer lifts
off and Home is exactly as it was, scenario intact. No detour through the Data Room. ✓
The same applies to Valuation and Sprint, and to the Playbook / Connections "add
financials" actions.

## 7. Contextual Viewer → Back

Galileo answer → exact source document → single level, header **← Vision**, Back
returns to the same Galileo context (Home is never unmounted). From inside another
room — Valuation → source — `from=valuation` records the origin, so the header reads
**← Business Valuation** and Back returns there rather than to Home. ✓

## 8. Close behaviour

Close (✕) still exits the whole overlay, at every level, to the originating Vision
context: Home → Data Room → Upload, **Back** = Data Room, **✕** = Home. The two are
now genuinely different actions, and Back is labelled with the room it goes to. ✓

## 9. Mobile

One component tree, one stack: the mobile view renders the same full-screen overlay and
the same `WorkspaceHeader`, so `Data Room → Upload → ← Data Room` behaves identically.
Nothing in the fix is breakpoint-dependent. ✓

## 10. Business-switch behaviour

A real business change (A → B) collapses the layer's sub-levels and clears the
sub-view params, and the content region still remounts on the business id. A document
id belonging to A therefore cannot survive into B: the Data Room's fail-closed lookup
never finds it in B's list, shows the toast and clears the request. No stale A
document or sub-view remains. ✓

## 11. Files changed

| File | Change |
| --- | --- |
| `src/hooks/useVisionWorkspace.js` | Levels (workspace + sub-view), `from` origin, `replace()`, contextual `backLabel`, business boundary, breadcrumb de-duplication |
| `src/components/vision/workspace/WorkspaceHeader.jsx` | Back control names its destination (`backLabel`) |
| `src/components/vision/workspace/VisionWorkspace.jsx` | Hands the layer's own navigation to the workspace content |
| `src/pages/galileo/GalileoReimagined.jsx` | Names the underlay surface (What If, Playbook, Galileo, …) for contextual Back |
| `src/components/galileo/documents/GalileoDocumentOverlay.jsx` | Level-aware upload → review handoff; wires the layer into the Data Room |
| `src/pages/DataRoom.jsx` | Sub-views are levels (upload, viewer, tabs); viewer close = step back; route-form deep link returns to its origin |
| `src/lib/visionWorkspace/openDocument.js` | The contract records the origin (`from`) for both its Vision and route forms; same-origin paths only |

## 12. Build / lint

- `npx vite build` → **exit 0**, no missing or unresolved imports.
- `npx eslint` over every changed file → **0 errors**. One pre-existing warning
  remains in `src/pages/DataRoom.jsx` (a redundant `eslint-disable` directive that was
  already in the file); left untouched deliberately — removing it would turn a
  harmless warning into a hard error if the rule ever fires.
- No backend calls, no destructive tests, nothing published.

## 13. Browser checks still requiring you

- **A** Home → Destinations → Data Room → Upload documents → **← Data Room** → repository, overlay still open.
- **B** Data Room → click a document → viewer → its ✕ / Escape → repository, overlay still open (and **← Data Room** afterwards).
- **C** Data Room → Review tab → **← Data Room**.
- **D** Home → Data Room → **✕** (or **← Vision**) → Home.
- **E** What If → Upload financials → **← What If** → scenario as you left it.
- **F** Galileo answer → source document → **← Vision** → same answer.
- **G** Valuation (or an assessment on its own route) → source document → Back → that surface.
- **H** Sprint task → source document → Back → the same Sprint/task.
- **I** Data Room → Upload → upload a file → "Review what I found" → **← Data Room** → repository (not the uploader).
- **J** Business A Data Room → switch to Business B → no A document or sub-view appears, and the header no longer offers A's levels.
- **K** Also worth a look: reload the page while the uploader is open — Back still reads **← Data Room**; reload while a contextual upload is open — Back reads **← What If**.