# VISION — GALILEO × DOCUMENT ASSIGNMENTS (understanding + management)

Status: **implemented, runtime-verified against real records, NOT published.**
No second assignment table, team model, document system, notification system,
Galileo assistant, authorization model or prioritization engine.

Scope delivered: **Parts 2, 3, 4, 5 (context), 7, 8, 9** — Galileo reads, explains,
resolves, proposes and confirms assignment work through the existing contracts.
**Part 6 (Next Best Move) is deferred** (§34).

---

## 1. Galileo architecture audited

| Piece | What it actually is |
| --- | --- |
| `base44/functions/askGalileo/entry.ts` (510 → 724 lines) | **The conversational runtime.** One business-scoped path: canonical business resolution → context assembly (BIE recommendations, assessments, documents, NBA, sprint, notes, hypotheses, learning patterns, valuation) → one OpenRouter call → deterministic fallback → `{ response, conversation_id, … }`. |
| `base44/shared/galileo/executive/*` | Intent resolution, capability selection, priority/confidence models, follow-up planner, interruption policy. **Metadata + selection only** — no tool loop, no write path. |
| `base44/shared/galileo/capabilities/*` | A registry of capability categories (15) plus governance/context/permission modules. **Also metadata** — the registry stores what exists, it does not execute. |
| Current-object context | **Already existed**: `focused_record_type` + `focused_record_id` (`askGalileo` body), used today by the valuation path. This is where "this" belongs; nothing new was invented. |
| `src/hooks/useAskGalileo.js` | The one frontend entry: sends `active_business_id` (canonical), discards stale/out-of-business responses, maps `response` → `answer`. |
| Ask surfaces | `AskGalileoBar` (home), `WorkspaceAskGalileo` (every workspace), `GalileoAnswerPanel` (the answer). One hook, one function, one contract. |
| Business scope | `resolveActorBusinessContext` / `resolveActiveBusiness` — **refuses** an ambiguous multi-business request rather than substituting `primary_business_id`. Preserved untouched. |
| Assignment contract | `documentAssignments`: `roster`, `listForBusiness`, `forDocument`, `listMine`, `assign`, `setStatus`, `remove` — the single authoritative writer, with roster/scope/ownership/actor proven per call. |
| Notification destination | `notificationDestination` + `useNotificationNavigation` (previous pass). |
| Plain language | The system prompt's own language block (TERM → plain meaning → why it matters here) + `src/lib/galileo/glossary.js` + `ExplainWithGalileo`. |

**Conclusion:** the architecture-consistent move was to extend `askGalileo` plus ONE
shared module — not to add a capability/tool runtime, and not to build a parallel
assignment assistant.

## 2. Existing capability/action architecture found

`capabilityRegistry` is metadata (id, category, label, context/evidence/analytics
requirements, permissions). The executive layer *selects* and *plans*; nothing in
either performs a mutation. There is therefore **no existing action/confirmation
runtime to extend**, and the confirmation pattern was taken from the surface that
already has one: the Data Room's assignment panel. Galileo renders the same
confirmation shape over the **same contract**.

## 3. Assignment read integration

`base44/shared/galileo/assignments/index.ts` (new, 585 lines) — pure, deterministic:

* `detectAssignmentIntent` — read (`mine`, `all`, `completed`, `document`, `person`) and change (`assign`, `complete`, `reopen`, `remove`), conservatively gated on assignment vocabulary so an ordinary question is never hijacked.
* Builds the answer text (`"You have 3 open document assignments."`), the records payload (groups of document → people, each entry carrying `assignment_id`, `document_id`, `assignee_profile_id`, type, status, note, `is_me`), and the LLM context block.

**Real records only.** Assignments come from `document_assignments`; the roster from
the membership model; documents from `documents` scoped to the business. Nothing is
inferred from notifications, chat history, document metadata, Sprint tasks, document
requests or extraction review (six concepts the prompt now names and separates).

## 4. Active-business scoping

The canonical resolved business is the only scope: every query filters `business_id`
and the answer carries that same `business_id` back for the write. Never
`primary_business_id`, never profile-wide, never "first"/"all" businesses. An
ambiguous request is still refused by the existing contract (verified: an existing
probe returned *"owns 3 businesses, so primary_business_id is ambiguous"*).

## 5. Person resolution

Against the **active business's roster** only, derived from the membership model
(`business_entities` owner + advisor, `business_owners`, `business_team_members` →
`profiles`). One match → used; several → asked ("I found more than one team member…");
none → *"I couldn't find a matching team member on this business's team."* A member of
another business is not in the roster, so cannot be resolved at all.

## 6. Document resolution

Inside the active business. Whole-name presence scores highest, otherwise significant
token overlap; the best score must be **strictly** better than the runner-up. A tie is
a question, never a coin toss. Not found → *"Vision could not find that document in
this business."*

**Bug found by the browser evidence and fixed:** a *person's* name was being used as
evidence for *which document* — "Assign this to Garrick Reevs" matched two documents
called `Reevs.Garrick.Integrator.pdf`. Two fixes: (a) when the sentence says
"this"/"it" and an authoritative focused document exists, that document wins outright;
(b) the resolved person's name tokens are excluded from document scoring. Re-verified
after the fix (evidence in §31).

## 7. Contextual "this"

Precedence, all authoritative:

1. `focused_record_id` as an **assignment** — validated to be in this business's list, and to be the actor's own (or the actor may manage).
2. `focused_record_id` as a **document** — validated to be in this business's document list (a forged id fails closed), then the actor's own assignment on it if there is exactly one.
3. Otherwise the actor's own open assignments: exactly one resolves; more than one is a question ("Which assignment do you mean?" with the real candidates); none is a calm statement.
4. **Never** guessed from plausibility.

`WorkspaceAskGalileo` derives the document focus from the workspace URL
(`?workspace=data-room&id=<document_id>`), which is the deep-link shape every
document link and every assignment notification already uses.

## 8. Notification-arrival context

The assignment notification's `action_url` and `metadata` already carry the exact
business + document + assignment + type (§ previous pass). Arriving there puts the
document in the workspace URL, the ask bar inherits it as `focused_record_id`, and
Galileo validates it against the business. **No notification text is ever parsed.**

## 9. Assignment creation

`assign this to Sarah for review` → proposal → confirm → `documentAssignments.assign`.
There is no Galileo-specific writer: natural language cannot reach a row except
through that contract, which re-proves business scope, document ownership, roster
membership and manage rights on every call. `askGalileo` itself **writes nothing**
(proved in §31).

## 10. Assignment-type resolution

`review` → review; "take action / needs action" → action_required; "FYI / for
reference / keep her in the loop" → fyi. Nothing inferable → *"What would you like
Sarah to do with it?"* with Review / Action Required / FYI. A responsibility level is
never chosen silently.

## 11. Confirmation architecture

One card, four actions, nothing written before it:

```
ASSIGN DOCUMENT
2025 Profit & Loss
Sarah Johnson · Review
Note: check the unusual marketing expense
[ Assign ]  [ Cancel ]
```

`complete`/`reopen` use the same card (`[ Mark complete ]`), `remove` uses
`REMOVE ASSIGNMENT` ([ Remove Assignment ] / [ Cancel ]). A clarification only *fills
in* the pending proposal — it is pure presentation state, and the final click is what
calls the contract.

## 12. Notes

Only from an explicit clause: `…and ask her to check the unusual marketing expense.` →
`check the unusual marketing expense`, preserved verbatim in the proposal and stored
through the existing `note` field (≤500 chars, as the contract already truncates).
Never manufactured, never paraphrased.

## 13. Duplicate / revive behaviour

Identity stays `(document_id, assignee_profile_id)`. When the person already has an
assignment on that document the proposal says **"Update Sarah's assignment on …?"**
instead of "Assign …" — so a re-assignment reads as the revive it is, and the contract's
upsert keeps one row. Verified: the live proposal carried
`existing_assignment_id: 47d620ee…` for a document/person pair that already existed.

## 14. Status completion

`Mark my review complete.` / `I'm done with this.` / `Mark this complete.` →
proposal → `documentAssignments.setStatus { status: 'completed' }`. With no
authoritative assignment context and several candidates, Galileo asks which one
(verified) rather than picking.

## 15. Own-vs-other-person behaviour

Read from the **same rule the contract applies** (`canManage` = admin, or the
`validateBusinessScope` reason matching owner/advisor) — not from a role assumption.
When the actor is the assignee, completion is offered. When they are not and they may
not manage, the answer is *"That review is assigned to Sarah, so they need to
complete it."* Authorization is never weakened; the contract would refuse anyway.

## 16. Reopen behaviour

`Reopen my review.` → proposal → `setStatus { status: 'open' }`. The contract's own
invariant is untouched: `completed_at` and `completed_by_profile_id` are cleared,
`status` returns to `open`, `updated_at` changes. No second reopen path exists.

## 17. FYI behaviour

FYI has no completion state and Galileo refuses **before** calling anything:
*"FYI assignments are reference-only, so there isn't anything to mark complete."*
No invented `seen` / `acknowledged` / `read` states, and the backend's 409 remains the
backstop.

## 18. Soft removal

`Take Sarah off this.` → proposal → explicit confirmation card → `remove`
(soft: `status='removed'`, history preserved). Never a DELETE. Managers only, as the
contract already enforces.

## 19. Assigned-to-Me context

The Data Room's own ask bar is the same `WorkspaceAskGalileo`, so in "Assigned to Me"
the current document travels as focus and assignment answers render there too. Own open
entries carry a one-click **Mark complete** (the contract is the writer). The tab's
*selection* is not part of the URL, so an assignment-level "this" resolves through the
focused document or the single-candidate rule rather than an invented id.

## 20. Document-intelligence integration

Unchanged and reused: the LLM already receives this business's document rows, and now
also the assignment context (type, note, status, who assigned it). "Help me review
this" is therefore answered from real records. No new summarization engine was added,
and no new document system exists.

## 21. Extraction-review separation

Enforced in two places: the assignment layer never reads or writes extracted fields,
and the prompt states that `review` does **not** mean extracted facts need
verification — completing an assignment never accepts a field, and accepting a field
never completes an assignment. Nothing claims a fact count that is not in the data.

## 22. Plain-language integration

The existing language system is preserved (correct term first, one short gloss, no
repeat glosses, glossary authoritative). Added: the six concepts are named and
separated, and the responsibility levels are glossed in plain words on first use
(*review — they read it and note anything that looks wrong*).

## 23. Next Best Move — DEFERRED (§34)

## 24. Security enforcement

* **askGalileo performs no writes.** Proved: six live calls, including an `assign` proposal and a `complete` proposal, left `document_assignments` at 4 rows / 4 open with no completed rows, and created **zero** notifications.
* Natural language cannot bypass authorization: the only write path is the confirm card → the authoritative contract.
* A forged `focused_record_id` fails closed (validated against this business's own lists).
* A foreign assignee is refused by the contract (roster + `validateBusinessScope`).
* A foreign assignment id is a 404 at the contract (row addressed *with* the business filter).
* Toast/bell navigation already converge on the same resolver and the same document contract.

## 25. Failure handling

Calm, no internals: *"This document is no longer available."*, *"Vision could not find
that document in this business."*, *"I found two documents named 2025 Profit & Loss.
Which one do you mean?"*, *"I found more than one team member who could match…"*,
*"I can't make that assignment for this business."*, *"That review is assigned to
Sarah, so they need to complete it."* No ids, RLS, service-role or stack traces reach
the owner. A contract refusal is shown in the contract's own words.

## 26. Files changed

New:
- `base44/shared/galileo/assignments/index.ts` — the orchestration layer (classification, resolution, answer/proposal assembly, prompt summary)
- `src/components/galileo/assignment/GalileoAssignmentAnswer.jsx` — records, clarification, confirmation, result
- `src/GALILEO_DOCUMENT_ASSIGNMENT_INTELLIGENCE.md` (this report)

Edited:
- `base44/functions/askGalileo/entry.ts` — assignment context + intent branch; concept separation in the system prompt; deterministic answer path; assignment payload
- `src/hooks/useAskGalileo.js` — carries `focus` as the existing `focused_record_type`/`focused_record_id`; passes `assignment` through
- `src/components/vision/workspace/WorkspaceAskGalileo.jsx` — derives the document focus from the workspace deep link; renders assignment answers
- `src/components/galileo/home/GalileoAnswerPanel.jsx` — renders assignment answers

## 27. Backend changes

`askGalileo` only. **No new backend function, no new action, no new endpoint.**
`documentAssignments` is unchanged — it remains the single writer.

## 28. Database changes

**None.** No table, column, index, policy or migration.

## 29. Build / lint

`npx vite build` → **exit 0**. ESLint on all four touched frontend files → **clean**.

## 30. Runtime tests performed

Live calls against the real business `42f42075…` (3 open assignments, 2 documents that
share a filename, a roster containing the owner):

| Question | Result |
| --- | --- |
| "What's assigned to me?" | 200, `source: document_assignments`, *"You have 3 open document assignments."* + 3 real groups with real ids |
| "What should I focus on?" | 200, unchanged BIE path (`source: bie`) — assignment layer not invoked |
| "Who is assigned to this?" (document focus) | 200, `show_people: true`, the real person on that document |
| "Mark this complete." (assignment focus) | 200, `mode: proposal`, `action: complete`, the exact assignment/document/assignee |
| "Assign this to Garrick Reevs for review." (document focus) | 200, `mode: proposal`, `action: assign`, focused document, `assignee_has_account: true`, **`existing_assignment_id`** → headline *"Update Garrick Reevs's assignment on phase2_2_final_test.pdf?"* |
| "Assign phase2_2_final_test.pdf to Garrick Reevs for review." | 200, **clarify** — two documents genuinely share that name, so it asked instead of guessing |
| "Mark my review complete." (no context) | 200, **clarify** with the 3 real candidates |

Post-test database state: `document_assignments` = 4 rows, **4 open, 0 completed**;
`Notification` rows of type `document_assigned` = 4, newest from the earlier browser
run — **none created by any askGalileo call.**

## 31. The reported 500 — investigated, explained, fixed

The browser run failed with `POST /api/functions/askGalileo → 500` after **50.4 s**.
I could not reproduce it: the same question returned **200 in 5.6 s** (twice). The
50 s pointed at the real defect, and it was mine: an assignment answer is *already
fully determined* by the records, yet the request still waited on OpenRouter before
overriding the prose. A slow or unavailable model could therefore delay — and fail —
an answer that never needed it.

**Fix:** when the assignment layer has produced an answer, the model is not consulted
at all; the deterministic response is returned directly. Assignment questions went from
5.6 s (model-dependent) to **1.9–2.4 s, with no model in the path**, so they can no
longer be delayed, altered, or failed by one. Every other question keeps the existing
path unchanged.

## 32. Browser tests performed

None by me — I cannot drive a browser. The Testing Agent's first run **passed**: the
assignment write produced exactly one assignment and exactly one notification, the
recipient saw the bell-adjacent bubble and heard the sound, the assigner heard nothing,
and clicking the bubble landed on the exact document in the Data Room overlay with the
business switched first.

## 33. Manual browser checks remaining

Re-run the Galileo case that failed, now that the model is out of that path:
*"Ask Galileo what's assigned to me and confirm it lists the real assignments with an Open Document button"*, then
*"Assign a document to a teammate from Galileo and confirm the confirmation card appears and nothing is written until I press Assign."*
Also worth a pass: two people with the same first name → clarification; FYI completion → the reference-only answer.

## 34. Deferred, and why

* **Part 6 — Next Best Move integration.** Assignments are not yet candidates in the existing prioritization engine (`nextBestMoveResolver` + `homeSignals`). That is a change to another engine's scoring, with its own eligibility and ranking rules; it deserves its own pass rather than a rushed insertion, and nothing above depends on it.
* **Deeper document-intelligence help** ("summarize this", "help me review this" with extraction-aware issue spotting). The context is in place and the answers are grounded, but orchestration over the extraction/intelligence surfaces is a further step.
* **A sound preference.** None exists in `NotificationPreferences`; the default subtle chime ships, and a preference could be added later.

**Not published. Phase 6C not begun.**