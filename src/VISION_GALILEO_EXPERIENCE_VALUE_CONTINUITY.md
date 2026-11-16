# VISION — GALILEO EXPERIENCE, VALUE REVEAL & CONTINUITY

## STOP CONDITION

**Phase 1** certified the audit (Part 0), the Galileo visual identity and its
truthful state bindings (Part II), the signature discovery moment (Part III,
reveal only) and the verification email (Part XIV).

**Phase 2 (this section) additionally certifies**: the Next Best Action engine
(§9–§14, §27), the experience-cliff repair (§8, §15) and the preservation moment
(§6). See "PHASE 2" below for the evidence.

**STILL BLOCKED — the complete journey is NOT certified.** The exact remaining
reasons, in order of consequence:

1. **REPAIRED (Phase 3).** The discovered opportunity is now promoted server-side:
   promotion re-derives it from the canonical rows it just wrote and persists it
   through the existing `galileo_opportunities` path, so the thread the owner was
   pulling survives verification. See "PHASE 3" below.
2. **§IV/§VI are not built**: the explicit free-vs-deeper boundary treatment, and
   the Connections-as-accelerator framing.
3. **§VII is not built**: clicking a Pulse domain focuses the existing domain
   surface; a Galileo lens carrying a domain-specific narrative is not wired.
4. **§XVIII–XXI and §XXIII are not built**: the Galileo/Expert fork and
   entitlement treatment are reused as they exist (not reworked), and the mobile
   hierarchy has not been swept.
5. **§XXVIII is not run** and §30's screenshots are not provided — they require a
   live browser session, which is the Testing Agent's job (see below).

Nothing below claims otherwise.

---

## 1. AUDIT (Phase 0)

### Systems found and REUSED (nothing duplicated)

| System | Where it already lives | This turn |
|---|---|---|
| Galileo conversation + progression | `src/hooks/useGalileoConversation.js`, `src/lib/galileo/experienceStateMachine.js` | reused; untouched except the previously repaired anti-loop logic |
| Knowledge Gap Engine | `selectNextGap` + `QUESTION_FIELDS` + `answered_question_ids` | reused; re-verified (O1–O25, V1–V7) |
| Business Intelligence level | `useBusinessIntelligenceContract`, `modelCompleteness` | reused; `modelCompleteness` is now the orb's coherence input |
| Business Pulse (6 domains) | `src/components/galileo/shell/LivingBusinessPulse.jsx` (`SignalState.UNKNOWN` → "Learning…") | untouched |
| Opportunity / Strategy / Scenario / Play / Action | existing engines, `OpportunityFocus`, `PlaybookSurface`, `useImplementationPlan` | untouched; the five concepts stay distinct |
| Next Best Action | `src/lib/galileo/nextBestMoveResolver.js` (`MoveType`, `resolveNextBestMove`, `explainWhyThis`), `NextBestMove.jsx` | **not touched** — identified as the reuse target for Part X |
| Entitlement / depth boundary | `useMembership()` (`tier`, `isPaid`, `isAdvisorOrAdmin`) + `implementationAccess.js` | **not touched** — the existing boundary to reuse for Part IV |
| Continuity / preservation | `saveManager.js`, `magicLoopConversation.js` promotion, `SaveProgressModal`, `AccountPromotionScene` | **not touched** — reuse target for Parts VIII/IX |
| Security kernel, canonical actor, business authorization, RLS, document authorization, signed URLs, evidence semantics, Digital Twin promotion, ingestion, spreadsheet extraction | existing shared modules and functions | **not touched** |
| Animation libraries | framer-motion, lucide-react (already installed) | reused; **no dependency added** (canvas 2D) |
| Reduced motion | *none existed anywhere in the app* | introduced, in the orb only |
| Verification email | `base44/emails/` **did not exist** — the platform's default mail was shipping | taken over (Part XIV) |

### Duplicate architecture explicitly avoided
No second Galileo · no second business model · no second Knowledge Gap Engine ·
no second onboarding store · no duplicate opportunity or next-action
architecture · no six Pulse dashboards · no parallel billing or entitlement
system · and **no new state store** — the orb carries no state of its own.

---

## 2. GALILEO VISUAL IDENTITY (Part II) — IMPLEMENTED

### Rendering technology
Canvas 2D, one `requestAnimationFrame` loop, device pixel ratio capped at 2,
frames skipped while the tab is hidden, loop cancelled on unmount. A WebGL/three
scene was rejected: the visual language (fine champagne linework, translucent
core, restrained node network) is achievable at a fraction of the cost, and the
brief forbids adding a large dependency casually. The identity is **not** a GIF
or a looping video: it responds to application state.

### The contract — one pure module
`src/lib/galileo/orbPresence.js` is the **entire** interface between VISION and
the visualization:

* `orbProfile(state, { intelligence, reduced, compact }) → drawing parameters`
* `resolveOrbState({ degraded, hasNewInsight, isThinking, hasNewEvidence, attention, isResponding, isListening }) → state`
* `ORB_STATES` (nine) · `ORB_STATE_LABEL` (accessible words) · `ORB_STATE_COPY` (safe generic copy)

Pure and deterministic, so the mapping from real state to what the owner sees is
directly assertable.

### Nine states, each bound to something real
`idle` `listening` `thinking` `analyzing` `discovery` `responding` `learning`
`attention` `degraded`.

* **thinking / analyzing** — only selected while a real request or analysis is in
  flight (`isThinking`), never by a timer.
* **discovery** — only reachable through `hasNewInsight`.
* **learning / attention / degraded / responding / listening** — each requires its
  own boolean from the caller. There is no path that shows work that is not
  happening, and no artificial delay exists anywhere in the identity components.

### Truthful bindings wired this turn
| Placement | Binding | File |
|---|---|---|
| Onboarding conversation, while Galileo works | `isThinking` (real request in flight) | `ConversationStream.jsx` (replaces the generic spinner) |
| First genuine insight of a session | mounts **because** an insight entry exists → exactly one pulse, no timer, no second reveal | `GalileoDiscoveryMoment.jsx` + `ConversationStream.jsx` |
| Shell lockup | the ✦ identity, at mark weight | `GalileoShell.jsx` |
| Ask Galileo input | lightweight mark (`live` while loading) — deliberately **not** the full renderer in every input | `AskGalileoBar.jsx` |
| Orb coherence | the REAL `modelCompleteness` passed through `GalileoReimagined` → `ConversationStream` → orb | `GalileoReimagined.jsx`, `ConversationStream.jsx` |

### Business Intelligence → orb
Intelligence changes **coherence only** (structural connection density). It is
not a progress ring, and no progression is fabricated for animation — a constant
intelligence level produces a constant coherence, asserted by P4/P5.

### Performance · reduced motion · privacy · accessibility
* One loop, cancelled; capped DPR; fixed-size wrapper (no reflow from the orb).
* `prefers-reduced-motion` → a **single coherent frame**, zero particles, no
  inflow, no pulse (P6, P16).
* Compact viewport → simplified geometry, fewer nodes/bands/particles (P7).
* Canvas failure (no 2D context) → the presentational layer steps aside; Galileo
  is unaffected (P15).
* **Privacy by construction:** the orb's accepted props are exactly
  `state, size, intelligence, decorative, className`. No business value,
  document, URL, identity, token or evidence can arrive, and nothing is written
  to the console, analytics or a DOM attribute (P10, P11, P13).
* Nine accessible state labels exist, so state is never communicated by
  animation alone (P9).

---

## 3. VERIFICATION EMAIL (Part XIV) — IMPLEMENTED

`base44/emails/EmailVerification.html` — raw inbox HTML (the reserved-name
exception, deliberately **not** MJML), one 600 px single column, inline styles.

* Near-black `#0d0d0d` field, champagne `#d4a853` accent, generous spacing, no
  heavy borders, no flat gold header band.
* The VISION logo is referenced by its absolute https production asset with
  meaningful alt text ("V.I.S.I.O.N. Platform"). No filesystem path, no private
  signed URL, and **no private storage was made public** to render it.
* The brand also appears as **text** in the footer, so the mail identifies itself
  when images are blocked.
* The code is rendered as **text** (`{{otp_code}}`), readable with images off,
  with the 10-minute expiry and the safe-ignore line.
* No business name, financials, documents or account data; no offer, no
  marketing block, no em-dash; one link, to the app's own live domain.
* **Authentication security unchanged:** the template only changes appearance.
  OTP entropy, expiry, single-use behaviour, rate limits and anti-enumeration
  live in the platform and were not touched.
* Delivery note: this mail is screened, and it ships only for an app on its own
  custom email domain — if the screen refuses it, the platform's own mail ships
  instead. Client-by-client rendering (E8–E11) cannot be verified from here.

---

## 4. SECURITY

**No file in this slice touches:** `business_facts`, `business_fact_evidence`,
Digital Twin promotion gates, the 6D evidence or spreadsheet architecture,
document ingestion, RLS, canonical actor resolution, document authorization,
signed-URL minting, expert relationship authorization, or tenant isolation.

The entire slice is presentational plus one wiring line per surface. The orb is
proven unable to receive business data (P10/P11), and the email carries none.

### Boundary suites re-run
| Suite | Result |
|---|---|
| `documentAccessAuthorization` | **PASS** |
| `digitalTwinActivationSafety` | **PASS** — ALL CHECKS, Digital Twin gates intact |
| `architectureGuard` | **PASS** — no forbidden dependencies (the orb added none) |
| `galileoContextActorBinding` | red — **pre-existing, not this slice** |
| `relationshipRevocationAccess` | red — **pre-existing, not this slice** |
| `documentSignedUrlAuthorization` | red — **pre-existing, not this slice** |

**Why the three red suites are not attributable to this work:** the first two
assert a *frozen change surface* from earlier security reviews and enumerate
~140 files from slices that landed long before this one (documentUnderstanding,
digitalTwin, spreadsheet readers, 6D.1B.2 reports); the working tree contains
only 8 changed entries and none of those files. The third asserts the order of
operations *inside* a document-access path (`URL minting was not the final
operation`) — a function this slice does not modify, and a source-order
assertion cannot be affected by adding presentational files. All three are
recorded as open debt to triage separately; none is silently dismissed.

---

## 5. CERTIFICATION EVIDENCE

| Check | Result |
|---|---|
| `scripts/galileoPresence.test.cjs` — P1–P17 | **ALL CHECKS PASS** |
| presence mutations (M-COHERENCE, M-PULSE, M-DATA) | **3/3 APPLIED + BEHAVIOR_CHANGED + CAUGHT** |
| `scripts/galileoOnboardingRecovery.test.cjs` — O1–O25 + V1–V7 | **ALL CHECKS PASS** |
| onboarding mutations (M-LOOP, M-EARLY, M-FRAGILE) | **3/3 CAUGHT** |
| `vite build` | **exit 0** |

The presence harness asserts, on the real modules: idle renders · unknown state
never crashes · only discovery/attention pulse · coherence rises with real
intelligence and is bounded · intelligence changes coherence *alone* · reduced
motion removes particles, inflow and pulse · compact viewports simplify geometry
· states resolve from real flags in a truthful order · every state has an
accessible label · the orb's prop list is the privacy boundary · no business
identifier reaches the identity components · no timer fabricates processing time
· nothing leaks to console/analytics · one cancelled loop · canvas failure and
reduced motion never block Galileo.

---

## 6. DEFERRED (not built, not certified)

III (reveal content beyond the discovery moment) · IV free value + entitlement
boundary treatment · V implementation fork (Galileo / Expert, HANDLE IT FOR ME
kept out) · VI connections-as-accelerator framing · VII Pulse domain interaction
panel · **VIII/IX account preservation + continuity and the "no experience
cliff" repair** · **X Next Best Action hero** · XI contextual teasers · XV
responsive sweep at 1440/tablet/mobile · XVII performance measurement · XVIII
security regression battery · XIX–XXIV P/O/F/C/E/G acceptance batteries · XXVII
production smoke journey with screenshots.

**Also noted:** the Home "I'm still building my understanding" contradiction
(Part IX) was the highest-value repair after the hero — it is repaired in Phase 2
below, by re-deriving the discovery from canonical records rather than introducing
a second state model.

---

# PHASE 2 — VALUE → PRESERVATION → NEXT BEST ACTION → CONTINUITY

## 1. AUDIT — the reuse plan, as executed

| System | Where it already lived | Decision |
|---|---|---|
| Next-action resolution | `src/lib/galileo/nextBestMoveResolver.js` (`MoveType`, `resolveNextBestMove`, `explainWhyThis`) | **EXTENDED** — the existing deterministic resolver was the engine; no second resolver, no new next-action store |
| Hero rendering | `src/components/galileo/home/NextBestMove.jsx`, `MoveContextObject` | **EXTENDED** — orb anchor, honest fallback, real "more areas" count, dismissal |
| Business Intelligence | `useBusinessIntelligenceContract` → `buildHomeContext` | **REUSED unchanged** — the value gap, signals, opportunities and maturity all come from it |
| Business Pulse | `homeSignals.buildSignalsFromBIS` + `signalAwakening.SignalState` | **REUNTOUCHED** — Home Pulse already derives from BIS; no cosmetic preservation was added |
| Opportunity / Strategy / Scenario / Play / Action | `galileo_opportunities`, `business_opportunities`, BIS opportunities, `ninety_day_sprint_paths`, `playbookStore` | **REUSED** — every candidate maps onto one of these; no new opportunity model |
| Selected intent / answers / guest session | `useGalileoConversation`, `guestSessionService` (`guest_session_id`, `business_snapshot`, `assessment_answers`) | **REUSED** — the answers already promote into assessments, which is why the value gap survives |
| Promotion | `guestSessionService.promoteGuestSession` | **NOT TOUCHED** — the remaining gap in §7 is *here*, and it is reported rather than worked around |
| Goals / saved items | `goalIntelligence`, `saveManager` (business-scoped sessionStorage) | **REUSED as the pattern** for the new handled-move ledger |
| Knowledge Gap Engine | `questionPriorityEngine.selectNextGap` | **REUSED as the designated provider** — deliberately not wired into Home (see §5) |
| Entitlement | `useMembership`, `implementationAccess.resolveImplementationAccess` | **NOT TOUCHED** — no new billing rule of any kind |
| Expert / advisory | `useAdvisorRelationship`, `HomeExpertSheet`, existing authorization | **NOT TOUCHED** — no path from the hero into access |
| Orb | `GalileoOrb` / `GalileoOrbMark` / `orbPresence` | **REUSED unchanged**, now anchored to the move's real state |
| Documents, evidence, Digital Twin, ingestion, spreadsheet extraction, RLS, actor binding | existing shared modules and functions | **NOT TOUCHED** — no import changed |

Duplicate architecture avoided: no second resolver, no second handled-state store,
no second opportunity/business/session model, no second entitlement path.

## 2. VALUE BOUNDARY (§2–§3) — PARTIAL

What the free experience reveals today (all of it already existing behaviour,
newly *labelled* honestly): what Galileo sees (the insight entry), why it matters
(the insight copy + `explainWhyThis`), the rough potential impact (the value gap),
and a small number of directions (the `strategies` insight, already limited).

What this phase changed: **the impact label now says what it is.** A value gap is
rendered as "potential value gap", never as "modeled impact" (`impactKind`), so the
free surface cannot overstate what is known.

**NOT built:** the explicit free-vs-deeper boundary treatment (what the paid depth
adds, shown as a boundary rather than a wall). The implementation is *already*
behind `resolveImplementationAccess` — no new billing rules were invented.

## 3. PRESERVATION (§6–§7) — CERTIFIED (copy), PARTIAL (opportunity handoff)

ACCOUNT CREATION = PRESERVATION is now what the moment says:

```
I've found enough that this is worth keeping.
[ Save What Galileo Found ]     ← desc: "$1.1M potential value gap · 3 areas worth investigating"
```
Both facts come from the real model (`signals.value.gap`, `opportunities.length`),
so an empty discovery cannot produce a claim and the count is never padded (§F13).
The gate is unchanged and pre-existing: preservation is offered only after a
responsible insight was actually shown.

**What survives promotion today (canonical, verified by reading the promotion
path):** the owner's answers → `value_gap` (with `current_value`, `potential_value`,
`value_gap`), `profit_gap` (revenue + EBITDA margin), `operations_gap`,
`freedom_assessment` → assessments → BIS.

**What does NOT survive:** the *opportunity record* itself. `galileo_opportunities`
is not written during promotion, so a brand-new business has no opportunity card
until the opportunity engine produces one. This is reported, not faked: the hero
falls back to the canonical value gap (which IS preserved) rather than inventing an
opportunity. Fixing it means writing the discovered opportunity during
`promoteGuestSession` — a server-side change with its own authorization tests
(§S1, §S2, §S12), deliberately not attempted blind in this phase.

## 4. CONTINUITY (§8, §15) — CERTIFIED for the cliff; canonical-only by design

* The string "I'm still building my understanding of your business" **no longer
  exists in live code** — not as the resolver's reasoning, not as the hero's empty
  state. Asserted at source level and caught by mutation.
* The discovery is **re-derived from canonical records** (`valueContinuity.js`):
  the value gap from the promoted valuation, the constraint only when the canonical
  operations/freedom score genuinely shows one. A business with nothing canonical
  gets `null` — honest silence.
* **No cosmetic continuity anywhere**: no number is carried over from the guest tab.
  `deriveDiscoveryContext` reads only `homeContext` (BIS-backed).
* Pulse continuity is therefore canonical by construction: when the promotion's
  `value_gap`/`profit_gap` reach BIS, Home's VALUE and PROFIT tiles wake from the
  same source. Where BIS has no valuation, Home keeps learning — which is the
  legitimate case §15 allows, and the hero still acknowledges the discovery instead
  of going silent.

## 5. NEXT BEST ACTION (§9–§14) — CERTIFIED (engine), see notes for coverage

Deterministic contract: `type · title · subtitle · actionLabel · actionValue ·
reason · impact(+kind) · urgency · provenance · key · score`.

| Candidate | Source (real) | Urgency | State |
|---|---|---|---|
| `sprint_blocker` | Sprint needing review | 95 | active |
| `continue_play` | a Sprint in flight (`progress`) | 85 | **new** |
| `new_document` | BIS `recent_documents` since last visit | 80 | active |
| `continue_opportunity` | opportunity with status `active` | 65 | **new** |
| `value_gap_discovery` | canonical value gap + constraint | 62 | **new** |
| `document_assignment` | the assignment contract (mine, open, work) | 58 | active |
| `new_opportunity` | opportunity with status `available` | 55 | active |
| `goal_aligned` | goal + opportunity | 50 | active |
| `knowledge_gap` | supplied gaps only | 45 | **resolver-ready, provider not wired** |
| `connect_source` | `hasFinancials === false` (real state) | 35 | **new** |
| `explore_galileo` | always | 10 | **new — the honest fallback** |

Rules proven by the harness: an active Play outranks exploration; Connections is
never automatically the primary; an unsupported opportunity is never surfaced;
a cross-business candidate is dropped at the point of use; identical state produces
an identical answer (including array-order reversal); changed state changes the
action; **one object is one move** (the harness caught a real duplicate-card /
anti-loop leak here, caused by keying candidates by action type instead of by the
object — now keyed by object); a completed, dismissed or engaged move never comes
back as the hero; the surface is never empty.

**Coverage notes (honest):** `knowledge_gaps` is deliberately empty on Home — the
Knowledge Gap Engine owns questions and Home does not load conversation answers, so
no question is invented. Expert responses, financial-change detection and pending
scenarios remain INACTIVE exactly as the resolver already documented.

## 6. BUSINESS PULSE (§15–§16) — continuity certified, interaction NOT built

Continuity: canonical only (above). Interaction: clicking a domain still opens the
existing domain focus. The §16 Galileo *lens* ("here is what I understand about
business value" + drivers + confidence + next action) is **not built**.

## 7. GALILEO IMPLEMENTATION PATH (§18–§19) / EXPERT PATH (§20) / ENTITLEMENTS (§21)

Reused as they exist: the existing Strategy → Scenario → Play → 90-Day Sprint path,
the existing Expert/Advisory surfaces, and `resolveImplementationAccess` for depth.
**Not reworked in this phase**, and no new monetization, permission or handoff path
was introduced. What this phase *did* prove is the negative: the hero's entire
action vocabulary is a fixed allowlist of existing destinations, and no candidate
carries a role, permission or token (§S7) — so no control on the hero can mint
access to an expert, a business or a paid capability.

## 8. SECURITY (§24)

**Proven in this phase:** N12 (cross-business opportunity dropped at the point of
use, in addition to the business-scoped load), S11/S12 (the handled-move ledger is
business-scoped and never accumulates duplicate keys), S7/S7b (no privileged
payload can travel through a recommendation), S13 (the orb still accepts only
presentational props on Home), and the existing suites stay green:
`documentAccessAuthorization`, `digitalTwinActivationSafety`, `architectureGuard`.

**NOT proven, and not claimed:** S1, S2, S3, S5, S6, S9, S10 and S14 all depend on
the server-side preservation handoff that does not exist yet. They belong with it.

## 9. FUNCTIONAL / CONTINUITY / NEXT-ACTION CERTIFICATION (§25–§27)

`node scripts/galileoNextAction.test.cjs` — **N1–N15 + C6/C7/C8 + S4/S7/S11/S12/S13
+ D1/D2 PASS, 6/6 mutations APPLIED + BEHAVIOR_CHANGED + CAUGHT** (M-SUPPRESS,
M-DEDUPE, M-SCOPE, M-FALLBACK, M-ENGAGED, M-CLIFF).

Previously certified and re-run green after these changes: onboarding
(`galileoOnboardingRecovery`, O1–O25 + V1–V7, 3/3 mutations), presence
(`galileoPresence`, P1–P17, 3/3), `vite build` exit 0.

Not verifiable from here and therefore **not certified**: F1–F5, F6–F7 (evidence
surfaces — unchanged, existing architecture), F9–F12, C1–C5, C9–C15, N-1..N15 at
runtime in a browser, and every test that needs a real account, a real promotion
and a real document.

## 10. PRODUCTION SMOKE (§28) AND SCREENSHOTS (§30) — NOT RUN

The 23-step journey (new user → discovery → Investigate → preservation → verify →
authenticated continuity → next action → completion → Pulse → deeper fork) requires
a live browser session. It is handed to the **Testing Agent** (side panel), with
these goals: *"Complete anonymous discovery, preserve the business, verify, and
confirm the same value gap and next action appear after signing in"* and
*"Complete the Next Best Action on Home and confirm the hero advances to a
different move."* Screenshots are not attached for the same reason.

## 11. REGRESSION POLICY (§29)

Three suites are red and were red **before** this phase — classified as
**PRE-EXISTING BASELINE DEBT**, not new regressions: `galileoContextActorBinding`
and `relationshipRevocationAccess` assert a *frozen change surface* from earlier
security reviews (they enumerate ~140 files from slices that landed long before,
and the working tree contains only this phase's files), and
`documentSignedUrlAuthorization` asserts the order of operations *inside* a
document-access path this phase does not modify. **No new red behaviour was
introduced**, and scope was not broadened to make them green.

## 12. FILES CHANGED IN PHASE 2

Added: `src/lib/galileo/valueContinuity.js`, `src/lib/galileo/handledMoves.js`,
`scripts/galileoNextAction.test.cjs`.
Extended: `src/lib/galileo/nextBestMoveResolver.js`,
`src/hooks/useGalileoHome.js`, `src/hooks/useVisionActions.js`,
`src/components/galileo/home/NextBestMove.jsx`,
`src/components/galileo/home/GalileoHome.jsx`,
`src/hooks/useGalileoConversation.js` (preservation moment copy only).
Untouched: the orb, the onboarding architecture, the verification email, every
document/evidence/Digital Twin/RLS module.

---

# PHASE 3 — CANONICAL OPPORTUNITY PROMOTION (the last continuity defect)

## 1. AUDIT — `galileo_opportunities`, before writing

| Question | Answer found |
|---|---|
| Canonical writer | `base44/functions/galileoOpportunityEngine/entry.ts` — creates via `base44.asServiceRole.entities.galileo_opportunities.create(...)` |
| Ownership | `business_id` + `profile_id` on every record; **every** reader filters by `business_id` |
| Identity | `reasoning.recommendation_key` (the engine's `existingKeys` set). Phase 3 uses `reasoning.opportunity_key` and reuses a record whose key already exists |
| Lifecycle | `status`: `available · active · completed · archived · superseded`; the engine keeps at most 3 `active` and demotes the lowest |
| Value/scores | `estimated_value_created`, `impact_score`, `strategic_opportunity_score`, `confidence_score`, `expected_impact` |
| Evidence | `evidence_sources[]` — used here for canonical pointers, never document bodies |
| Linkage | `converted_to_path` / `path_id` (a Play), `generation_id` |
| Home consumption | `useGalileoHome` → `filter({ business_id })` → `homeContext.normalizeGalileoOpportunity` → `mergeOpportunities` → resolver |
| Creation service | none that accepts a discovery — so Phase 3 adds ONE shared boundary module, not a second model or writer |

**Decision: reuse.** No new entity, no second writer service, no guest-shaped
opportunity object. The boundary writes with the same client, same entity, same enum.

## 2. OPPORTUNITY PROMOTION — `base44/shared/galileo/discoveryPromotion.js`

Wired into `promoteGuestSession` as **stage 5c**, after the assessments exist
(the derivation needs them) and before the session is marked promoted.

* **Server re-derivation.** Inputs are read back from canonical rows only:
  `business_entities.industry`, `business_assessments` (`value_gap.results.value_gap`,
  `profit_gap.answers.p1_rev` + `ebitda_margin` → EBITDA re-computed server-side,
  `operations_gap.answers.involvement`). Nothing arrives from a request body.
* **Semantics match the discovery.** Owner dependency requires reported
  heavy/moderate involvement (light involvement is not a value constraint), and the
  impact uses the same `max(0, (75 - opsScore)/75) * 1.5` uplift the discovery engine
  uses — mirrored, not re-invented.
* **Confidence is a function of the evidence.** 70 when the guest supplied a financial
  statement, 45 when figures were reported. Never supplied by a caller.
* **Authorization.** The target `business_id` is `promotion_summary.business_ids[0]` —
  server-resolved. A missing or unresolvable scope writes **nothing** (asserted). The
  service-role client is the one the existing opportunity engine already uses.
* **Evidence stays evidence.** `evidence_sources` carry canonical pointers
  (`business_assessment` → the promoted assessment) plus the evidence *basis*. Nothing
  is written as verified or confirmed; `confidence_score ≤ 70`.
* **Client influence = one token.** `state_snapshot.explored_opportunity_key`,
  allowlisted, honoured **only** when the server itself derived that candidate. A token
  cannot create an opportunity, set a value, or name a business.

## 3. IDEMPOTENCY

Identity is `reasoning.opportunity_key`, scoped by `business_id`. An existing live key
is **reused, never re-created**; an archived/superseded key may be re-created.
Promotion itself refuses a second run (`status === 'promoted'` → early return), so a
repeated call, a retried verification callback or a refresh mid-handoff cannot
duplicate — proven end-to-end with stubbed persistence (second run: `created: 0,
reused: 2`, zero writes).

**The owner's in-flight work is protected:** an opportunity that already became a Play
(`converted_to_path` / `path_id`) is never demoted. A merely-active candidate yields the
lead to the resumed one — so Home has exactly one lead, and it is the one that was
being investigated.

## 4. CONTINUITY — guest → authenticated

| Was | Now |
|---|---|
| guest explores *Owner Dependency* | `/galileo` conversation, canonical derivation |
| preservation writes answers | `guest_sessions.assessment_answers` + `explored_opportunity_key` |
| promotion | `business_entities` → `business_owners` → `business_assessments` → **`galileo_opportunities` (active = the explored one)** → `dashboard_metrics` |
| Home | `continue_opportunity` (urgency 65) outranks `value_gap_discovery` (62) → **the SAME semantic opportunity leads**, with the preserved value gap still derived canonically |

Semantically continuous, not byte-for-byte: the record is the server's own derivation
of the same constraint — same title, same impact rule, same evidence basis. Intent,
answers and Pulse continuity are unchanged and canonical (Phase 2). **The discovery
animation does not replay**: `GalileoDiscoveryMoment` is rendered only by
`ConversationStream` (the guest conversation); Home never mounts it — verified at source.

## 5. FREE VALUE / ENTITLEMENT

**Shown free (verified existing behaviour, not re-built):** what Galileo sees, why it
matters, potential impact when supportable, the evidence explanation
(`Why Galileo Thinks This`), and 2–3 useful directions from the derived opportunity.
**Deeper:** implementation stays behind the existing `resolveImplementationAccess` /
membership path — untouched, no new billing rule invented.

**Entitlement gap (reported, not papered over):** the existing architecture expresses
depth as *implementation access* + membership, not as a
DISCOVER/ANALYZE/MODEL/PLAN/IMPLEMENT/EXPERT ladder. It holds today's product (one depth
boundary on implementation) but cannot yet name which *analysis* is free vs deep — so
the ladder is NOT built, and no parallel entitlement logic was created.

## 6. NEXT BEST ACTION / PULSE

Resolver, candidate priority and handled-state behaviour are unchanged from Phase 2 and
re-certified green after every Phase 3 change. Pulse continuity remains canonical. The
**Pulse → Galileo lens** (§9) is still NOT built: clicking a domain opens the existing
domain surface.

## 7. SECURITY INVARIANTS

| | Invariant | Evidence |
|---|---|---|
| S1 | guest cannot choose the target business | `missing_scope` → zero writes; the id comes from the promotion summary |
| S2 | a guest payload cannot become canonical | fully-formed opportunity, inflated value, chosen confidence and own evidence are all ignored |
| S3 | the server re-derives the opportunity | persisted values are the module's own derivation |
| S4 | the opportunity belongs to the authorized promoted business | writes scoped to the server-resolved business; unresolvable business → nothing written |
| S5 | duplicate promotion is idempotent | second run creates nothing, reuses both |
| S6 | another user's guest session cannot be promoted | promotion requires auth and an `active` session; identity is an unguessable `crypto.randomUUID()` session id (verified in `anonymousSession.js`) |
| S7 | a stale token cannot overwrite newer state | a token may only choose among currently derived candidates |
| S8 | evidence remains evidence-scoped | `evidence_sources` are canonical pointers; no document bodies or URLs |
| S9 | no evidence auto-confirmation | confidence derives from the evidence basis; no `verified` field anywhere |
| S10 | no evidence auto-verification | candidates assert no verified/confirmed state; status stays in the existing enum |
| S11 | expert CTA creates no authorization | boundary writes only `galileo_opportunities`, never a function or role |
| S12 | Pulse lens cannot cross business | unchanged (canonical context only) |
| S13 | Next Best Action cannot cross business | re-certified (`N12`, `S4`) |
| S14 | entitlement cannot be bypassed client-side | unchanged, not re-verified this phase |
| S15 | private document references remain private | asserted: no URL/storage reference reaches the record |

## 8. RESPONSIVE — NOT SWEPT

No viewport sweep this phase (desktop 1148 unchanged; no layout was touched).
1440 / MacBook / tablet / mobile inspection and the mobile Pulse hierarchy (§11)
remain outstanding.

## 9. PRODUCTION SMOKE — NOT RUN (no PASS/FAIL claimed)

Stages A–F need a live browser session and a clean user. **Not run**, therefore neither
PASS nor FAIL. Handed to the Testing Agent with these goals: *"Complete anonymous
discovery, investigate the opportunity, preserve the business, verify, and confirm the
SAME opportunity and value gap lead Home after signing in"* and *"Complete the Next Best
Action on Home and confirm the hero advances to a different move."* Screenshot review
(§16) is not provided for the same reason.

## 10. CERTIFIED THIS PHASE

`node scripts/galileoDiscoveryPromotion.test.cjs` — **34 checks PASS (P1–P15 + S1–S15 +
C3/C5/C6/C12/C13), 5/5 mutations APPLIED + BEHAVIOR_CHANGED + CAUGHT** (M-HINT,
M-DEDUPE, M-CONFIDENCE, M-SCOPE, M-CLIENT). Re-run green afterwards: next action +
continuity (6/6 mutations), onboarding (O1–O25 + V1–V7), presence (P1–P17),
`vite build`, and `guestSessionService` boots and executes with the new boundary
(`promoteGuestSession` on an unknown session returned the correct 404, not a module
failure).

## 11. KNOWN DEBT (baseline only)

Unchanged from Phase 2: `galileoContextActorBinding` and `relationshipRevocationAccess`
(frozen change-surface assertions) and `documentSignedUrlAuthorization` (ordering inside
a document path this phase does not touch) remain **PRE-EXISTING BASELINE DEBT**. No new
regression was introduced, and no historical debt was claimed as new.

## 12. FILES CHANGED IN PHASE 3

Added: `base44/shared/galileo/discoveryPromotion.js`,
`scripts/galileoDiscoveryPromotion.test.cjs`.
Extended: `base44/functions/guestSessionService/entry.ts` (import + stage 5c +
`OPPORTUNITY_PROMOTED` stage and `opportunities` summary),
`src/hooks/useGalileoConversation.js` (writes the explored-key token only).
Untouched: the opportunity entity and its engine, the resolver, the orb, the onboarding
architecture, every document/evidence/Digital Twin/RLS module.

---

# PHASE 4 — PULSE → GALILEO LENS + EXPERIENCE DEPTH (final pre-browser slice)

## 1. AUDIT — the reuse map, before any code

| Concept | What already existed | Decision |
|---|---|---|
| Pulse values | `homeSignals.buildSignalsFromBIS` → `computeHomeSignalStates` (BIS-native, provenance preserved) | **reused unchanged** — the lens reads the states, never recomputes a figure |
| Pulse click | `useGalileoHome.handleDomainClick` → DomainFocus view (`homeView = 'domain'`) | **refocused** — a click now resolves a lens inline; DomainFocus became the explicit deeper step |
| Domain content | `domainFocus.buildDomainFocus` (indicator, trend, industry, observation, related objects, starters) | **reused** for the deeper step; the lens does not duplicate it |
| Lens state | `activeDomain`, `signalStates`, `home.opportunities` already in `useGalileoHome` | extended with ONE `lens` state — no second context system |
| Next action | `nextBestMoveResolver` + handled-move ledger | **untouched** — still the standing primary action on Home |
| Membership | `useMembership` → `resolveImplementationAccess` (tiers, locked states, `/strategy-call`) | **unchanged and authoritative** |
| Fork UI | `ImplementationChoice` (labels, locked states, `navigate(action.destination)`) | **reused verbatim** in the lens |
| Expert surface | `HomeExpertSheet` + `openExpert` + relationship authorization | **unchanged** |
| Home fallback | `nextBestMoveResolver`'s honest, actionable fallback (§J already true) | **unchanged** — no apology string to fix |
| Orb | `GalileoOrb` / `orbStateForMove` | **unchanged**; a lens click sets no orb state at all |

Created: **no** new opportunity model, **no** new next-action resolver, **no** new Galileo
context system, **no** second Business Pulse, **no** billing, **no** entitlement system.
6D.1C was not started.

## 2. PULSE → GALILEO

`src/lib/galileo/pulseLens.js` turns a domain token into a lens. The browser expresses
**"LOOK AT VALUE"** and nothing else: the domain string is the only input that reaches the
resolver, and it is validated against the six known domains (an object or an unknown value
resolves to `null`).

The contract object Home works with is equivalent to:

```
{ domain, label, source: 'business_pulse', supported, statement,
  indicator, basis, driver, confidence, evidence,
  related_opportunities[], related_opportunity_ids[],
  prompts[], depth, nextLayer, primary }
```

`business_id` is deliberately **absent**: the business is whatever the canonical Home
context already resolved. Related opportunities are the canonical ones for that business,
matched on category/title text, capped at three, and only their ids are ever named.

Each domain behaves honestly:

* **Value** — "Here's what I currently understand about the value of your business." Current
  estimated value, the potential gap, the most likely driver (the strongest related
  opportunity, or the owner-dependency constraint the operations signal actually reports),
  confidence basis, and `Measured/modeled` labelled.
* **Tax** — with no tax evidence: "I don't know enough yet to give you a responsible answer
  about your tax position." → "Your latest business tax return would sharpen this." →
  **[Upload your latest tax return]**. Clicking TAX never manufactures a tax opportunity.
* **Profit** — the indicator is labelled **EBITDA margin** on purpose (`basis: 'Measured as
  an EBITDA margin.'`). No benchmark comparison is shown, because BIS carries no benchmark
  for this business: the Reasoning Gate holds by showing nothing rather than comparing
  unlike margins.
* **Cash** — always unsupported today; the lens says so and asks for the cash-flow evidence.
* **Operations / Freedom** — the reported owner-involvement state and its consequence.

Interaction: the lens unfolds **inline on Home**, directly under the hero, with the Pulse
still visible below and the selected tile quietly active (`activeDomain`, unchanged). No
modal, no route change, no dashboard. The command bar switches to the same real
domain-specific chips it offers in the full domain view.

## 3. EXPERIENCE DEPTH

`src/lib/galileo/experienceDepth.js` — five product experience states, **not plans**:
DISCOVER · UNDERSTAND · EXPLORE · IMPLEMENT · COLLABORATE, resolved by one deterministic
mapping from what Galileo can actually stand on (supported data → canonical opportunity →
existing work → a real expert relationship).

`nextLayerThread(depth)` gives each state exactly one quiet thread, and each thread names a
capability that already exists and is already wired: `view_opportunities`, `whatif`,
`open_sprint`, `expert`, `upload`. A thread cannot be added without its capability, because
the capability is the data, not the copy.

## 4. COMMERCIAL AUTHORITY (unchanged, and still the only authority)

Experience depth decides **what the surface is trying to do**. `useMembership` →
`resolveImplementationAccess` decides **whether the owner may proceed**. The lens renders the
existing `ImplementationChoice` fork verbatim: its words, locked states and destination come
from the existing resolver, and `action.type === 'access'` navigates to the existing
`/strategy-call` mechanism. The lens contains no `isPaid`, no tier, no price, no gate and no
locked boolean of its own (asserted).

## 5. FREE VALUE BOUNDARY

Free, and genuinely useful: what Galileo sees for that area, the current indicator with its
basis, the most likely driver, the confidence **basis**, why it matters, the canonical related
opportunities, and a few real directions to investigate. Not shown: the implementation
roadmap, a 90-day plan, tasks, unlimited modelling or expert implementation — those sit behind
the existing fork and the existing access resolver (`D4`, `D6`, `S7`, `S8`).

## 6. GALILEO PATH

The primary door calls `a.startGuide` — the same guided flow the Home ask bar already uses —
and the existing opportunity surface (`openOpportunityById`) remains the way into an
opportunity's own focus, from which Strategy → Scenario → Decision → Play → Sprint already
run. No second roadmap, no second playbook.

## 7. EXPERT PATH

The secondary door is the existing fork card: it explains the value ("Bring in an expert who
can work from the same business intelligence Galileo uses…"), names an attached advisor when
one exists, and routes the locked case to the existing access destination. **Clicking grants
nothing**: no assignment, no relationship write, no function call exists in the lens or its
module (asserted). A real expert gains access only through the existing authorized
relationship path.

## 8. MOBILE

No new mobile system was invented. The lens mounts in the required position — orb (hero) →
insight + primary action + thread (the lens) → standing primary move → **Business Pulse** →
dock — and the Pulse already renders as a **2-column compact grid** on phones (never six
cards in one row), which the existing design system already provides. The lens uses only
stacked, wrapping layout with no fixed/minimum widths, so no fixed-width overflow can be
introduced. Visual confirmation at 390/430px is a browser task (below).

## 9. ACCEPTANCE RESULTS (`scripts/galileoPulseLens.test.cjs`)

**42 checks PASS · 6/6 mutations APPLIED + BEHAVIOR_CHANGED + CAUGHT**

* P1–P12: all six domains focus Galileo; a browser payload cannot become a signal value
  (`999999999` is nowhere in the result); the lens names no business, fetches nothing, and is
  derived state (`useState(null)`) rather than stored state; a new lens replaces the prior one
  without carrying its figures; a business switch clears it.
* D1–D12: DISCOVER still has a real next step; UNDERSTAND explains why (owner dependency, from
  canonical material); confidence is a *basis* (Developing vs Supported by your documents);
  the preview is capped at three and never padded; the lens carries no plan/tasks/plays;
  entitlement lives only in `access`; the Expert door wires to the existing surface; every
  prompt has a real handler; the related count is the real count; no `setTimeout`/`analyzing`
  anywhere in the lens; every thread names an existing capability.
* S1–S10: business identity, canonical values, business data re-resolution, opportunity scope,
  strategy scope, Play scope, expert authorization, entitlement override, private evidence
  references, and business-switch isolation are each asserted.
* M1–M8: no fixed-width overflow source, hero → lens → move → Pulse order, 2-column Pulse,
  ask bar present, truncating preview rows, visible fork, dock intact.

**Honest limitation:** every one of these is a code/contract assertion. No browser rendered
this phase.

## 10. REGRESSION — no new regression

Re-run after these changes: discovery promotion (34 PASS, 5/5 mutations), Next Best Action +
continuity (ALL CHECKS PASS), onboarding (O1–O25 + V1–V7 PASS), orb presence (P1–P17 PASS),
Digital Twin activation safety (ALL CHECKS PASS, mutants caught), **build clean** (no
unresolved imports). Historical red suites are unchanged baseline debt; none was touched or
re-classified.

## 11. FINAL PRE-BROWSER CERTIFICATION

| PASS condition | Verdict |
|---|---|
| 1. Every Pulse domain meaningfully focuses Galileo | **PASS** (code + contract) |
| 2. Free insight is genuinely useful without the whole implementation | **PASS** (D1–D6) |
| 3. Galileo naturally reveals deeper capability | **PASS** (D12, real capabilities only) |
| 4. The owner can choose Galileo or Expert when ready | **PASS** (existing fork reused) |
| 5. Existing commercial/access architecture stays authoritative | **PASS** (D7, D8, S8) |
| 6. Existing security boundaries stay intact | **PASS** (S1–S10 + mutation battery) |
| 7. Mobile remains coherent | **BLOCKED — not visually verifiable without a browser** (structural contracts pass; no 390/430px sweep) |
| 8. No new regression | **PASS** (all suites + build) |

**VERDICT: READY FOR PRODUCTION BROWSER ACCEPTANCE on criteria 1–6 and 8;
BLOCKED ON CRITERION 7 (and on the live lens/teaser interaction), which requires a real
viewport.**

Handed to the Testing Agent: *"On a phone viewport, tap the Value signal on Business Pulse and
confirm the lens unfolds inline with the Pulse still visible, the primary action above it, and
no horizontal overflow"*; *"Ask one of the lens questions and confirm Galileo answers; then
click Work with an Expert and confirm nothing is granted without a relationship"*; and
*"Complete the Next Best Action on Home and confirm the hero advances."*

## 12. FILES CHANGED IN PHASE 4

Added: `src/lib/galileo/pulseLens.js`, `src/lib/galileo/experienceDepth.js`,
`src/components/galileo/home/PulseLens.jsx`, `scripts/galileoPulseLens.test.cjs`.
Extended: `src/hooks/useGalileoHome.js` (one `lens` state, lens-aware domain click, explicit
`openDomainDetail`, lens cleared on business switch), `src/components/galileo/home/GalileoHome.jsx`
(renders the lens, lens-aware command chips).
Untouched: the opportunity entity and engine, the next-action resolver, the BIS/signal layer,
DomainFocus, the orb, onboarding, membership/access, every document/evidence/Digital Twin/RLS
module.

---

# PHASE 5 — GALILEO PRESENCE + EXPERIENCE MAGIC PASS

## 0. ROOT CAUSE — why the golden intelligence visual was not visible

It was **not** a z-index, route, feature-flag, CSS-inheritance, reduced-motion or
component-missing problem. The renderer was correct and the state contract was correct. The
visualization was mounted wrong, sized wrong and lit wrong:

1. **One mount, inside a transient branch.** `ConversationStream.jsx` mounted `GalileoOrb`
   in exactly one place: inside `{isThinking && ( … )}`, as a 40 px element in a flex row
   beside the grey line "Galileo is thinking…". `isThinking` is true only inside the
   discovery window, so for the overwhelming majority of the first run **no orb was mounted
   at all**.
2. **Too small to carry the visual language.** At 40 px (and 56 px for the inline discovery
   moment), the profile's linework alphas — core 0.14, rim 0.16, edges 0.05–0.21, calibrated
   for a small mark — are effectively invisible against a near-black field.
3. **Inline, in a scroll list.** Both mounts sat *inside* the conversation column next to
   small text, never as a presence with its own space and gravity.

The intended medium intelligence form was therefore structurally present and visually absent.
The repair is a **persistent presence stage**, a **real size band**, a **size-derived luminance
factor**, and **real state bindings** — not a redesign.

## 1. FILES CHANGED

**Added**
- `src/lib/galileo/presenceStage.js` — the pure resolver: real experience state → orb state,
  size band and (only while work is genuinely in flight) one line of processing copy.
- `src/components/galileo/identity/GalileoPresence.jsx` — the persistent stage: the medium
  orb plus an atmospheric champagne field that extends beyond its bounds.
- `src/lib/galileo/interpretation.js` — deterministic, evidence-limited interpretation of the
  answer just given, and one line of reason for the question about to arrive.
- `scripts/galileoPresenceStage.test.cjs` — 21 structural checks + 4 mutations.

**Extended**
- `src/components/galileo/identity/GalileoOrb.jsx` — ONE size-derived clarity factor lifts the
  luminance the profile already computes at presentation sizes. State, coherence ordering,
  geometry, motion, reduced-motion behaviour and the one-shot pulse are untouched.
- `src/components/galileo/shell/ConversationStream.jsx` — the presence stage is mounted once,
  unconditionally, above the conversation; the 40 px thinking row and the inline discovery
  moment are retired in its favour; answered discovery pills collapse into the business
  summary; helper and secondary text raised out of near-invisibility.
- `src/hooks/useGalileoConversation.js` — interpret-before-ask; the discovery sequence now
  states what it found *before* showing the number, and states the modelled-EBITDA caveat only
  while the EBITDA genuinely is an estimate. Engine untouched.
- `src/lib/galileo/adaptiveQuestions.js` — the repetitive "Good — …" acknowledgements removed
  (copy only; selection and ordering logic unchanged).
- `src/components/galileo/shell/LivingBusinessPulse.jsx` — one restrained illumination when a
  signal genuinely changes state; contrast raised on labels and secondary values.
- `src/index.css` — the presence stage's atmospheric field, with the breathe removed entirely
  under `prefers-reduced-motion`.

**Untouched:** the Knowledge Gap Engine's selection logic, `questionPriorityEngine`, all
certified calculations, Digital Twin promotion, Business Pulse signal derivation,
authorization, entitlements, canonical actor resolution, expert permissions, storage and
document security, evidence rules. 6D.1B.3 / 6D.1C not started.

## 2. VISUAL STATES IMPLEMENTED

| State | Real trigger | What the owner sees |
|---|---|---|
| `idle` | present, nothing running | near-still; fine filaments drifting |
| `listening` | a question is on screen and unanswered | energy draws inward; attentive |
| `thinking` | a real computation/request is in flight | filaments begin connecting; "Reviewing what I know…" |
| `analyzing` | the discovery model is genuinely being composed | denser internal network; "Connecting what you've told me…" |
| `discovery` | a genuine insight entry now exists | converged motion, ONE champagne outward pulse |
| `learning` | document understanding is running | more organised structure; "Connecting the pieces…" |
| `attention` | Galileo is presenting a decision | settles, one very subtle pulse |
| `responding` | Galileo is presenting a result | motion settles |
| `degraded` | the surface cannot load | muted, no dramatic colour |

Coherence continues to come from the real Business Intelligence level and changes **only**
structural connection density — never a progress ring, never fabricated progress.

## 3. EXPERIENCE CHANGES

**Onboarding** — Galileo now has a body: the stage is present before, during and after every
question, and the answer controls no longer appear above an empty void. The stage is smaller
once the content beneath it needs the room.

**Interpretation** — before the next question, Galileo may say one thing it genuinely knows
from the numbers just given ("$5.0M in revenue and roughly $500K of EBITDA puts you around a
10% margin."). When nothing is derivable it says nothing and simply progresses, which is what
varies the rhythm. The question engine is untouched, so no question can be skipped, repeated or
reordered by this change.

**Pulse** — unchanged derivation; a signal that genuinely changes state now receives ONE soft
illumination that fades. No bounce, no flash, no celebration.

**Discovery** — the sequence is now: controls recede → ANALYSIS with truthful copy → the
profit signal → "I found something worth looking at." → the number → the modelled-EBITDA
caveat, said only while it is true. Processing language appears only while real work is running;
the fabricated 800/1200 ms beats were reduced to a single 350 ms beat plus the reveal.

**Investigation / scenario / implementation fork / preservation** — structurally unchanged this
pass (see DEFERRED).

## 4. SECURITY CONFIRMATION

The visualization's accepted props remain exactly `state, size, intelligence, decorative,
className` — asserted. It is handed booleans, a flow word and a coarse 0-100 level; no business
value, document, URL, token, identity or evidence can arrive, and nothing is written to
analytics, logs or a DOM attribute. The stage passes only `state`, `size` and `intelligence` to
the orb (asserted both by contract and by mutation). No authorization, entitlement, canonical
actor, expert-permission, storage, document-security or evidence rule was touched. Existing
security suites remain green.

## 5. TEST RESULTS

| Suite | Result |
|---|---|
| `scripts/galileoPresenceStage.test.cjs` (new) | **21 checks PASS · 4/4 mutations APPLIED + CAUGHT** |
| `scripts/galileoPresence.test.cjs` (P1–P17) | ALL CHECKS PASS |
| `scripts/galileoOnboardingRecovery.test.cjs` (O1–O25 + V1–V7) | ALL CHECKS PASS |
| `scripts/galileoNextAction.test.cjs` | ALL CHECKS PASS |
| `scripts/galileoDiscoveryPromotion.test.cjs` | ALL CHECKS PASS |
| `scripts/galileoPulseLens.test.cjs` (P/D/S/M) | ALL CHECKS PASS |
| `scripts/digitalTwinActivationSafety.test.cjs` | ALL CHECKS PASS |
| `vite build` | exit 0 |

## 6. BROWSER ACCEPTANCE — **NOT OBSERVED. NOT CLAIMED.**

The harness above proves the STRUCTURE that makes the visual appear (mounted unconditionally,
at a real size, from real state, with no timer and no data). **I cannot render a browser, so I
did not observe the golden Galileo visual on screen, and this pass must not be called
production-ready on that basis.** The browser acceptance the brief requires (states A–G, and
whether discovery reads as visually distinct from a normal question) is handed to the Testing
Agent with these goals:

1. *"Load the first-run Galileo experience and confirm a large golden spherical intelligence
   visual is clearly visible above the conversation, with a soft glow around it."*
2. *"Confirm the visual changes while Galileo is working and produces one gold pulse when the
   first discovery appears, then confirm a normal question does not produce that pulse."*
3. *"On a phone viewport, confirm the visual is smaller, the question stays above the fold and
   there is no horizontal overflow."*

## 7. DEFERRED (named, not silently skipped)

Scenario drawer sections (§16) · investigation hypothesis hierarchy (§14) · opportunity action
hierarchy (§13) · preservation presentation (§19) · "Let's do this" copy polish (§17) ·
Connections control integration (§11) · the 1440/tablet/phone responsive sweep (§24) ·
performance measurement (§25). The implementation fork continues to resolve access through the
existing `resolveImplementationAccess` authority; nothing in this pass grants access on click.

---

# PHASE 6 — CINEMATIC INTRO → GALILEO REVEAL → FIRST-RUN HOOK

## AUDIT (before any code was written)

**1. The previous VISION intro video — found, intact, reused.**
`src/components/experience/IntroExperience.jsx` renders
`https://media.base44.com/videos/public/6a2338cb6dd7f8bfcf561ec3/be6c89ab6_Visionintrovideo.mp4`
— a **public, permanent media URL** (never a private or signed URL). The component already
owned the whole contract: imperative `muted` for autoplay, `playsInline`, skip, replay,
`onComplete` on `ended`, an `onError` path, and a fallback frame. **Only one media URL exists
anywhere in the project.** No second video was created, and no media file was added.

**2. How it was previously wired.** `src/pages/EnterpriseJourney.jsx` (route `/journey`) →
`ExperienceManager` journey states `INTRO → WELCOME → CREATE_BUSINESS → …`; completion/skip
both set the durable flag `vision_intro_completed` (`INTRO_COMPLETED_KEY`) which
`loadJourneyState()` reads to skip INTRO on a later visit; the terminal state navigates to
`/galileo`. `ExperienceLayout` + `ExperienceTransition` owned the scene changes.

**3. The current anonymous entry route.** `/` → `HomeGate` → unauthenticated →
`<GalileoReimagined />` (the Magic Loop). `App.jsx` and `useGalileoConversation` both document
that `/journey` is **retained but no longer the default entry**, and the Phase 3–5.1 pilot flag
is retired.

**4. Therefore: the video was STILL IN THE PROJECT AND MERELY DISCONNECTED.** It was not behind
a flag, not replaced by another entry component, and not deleted — it simply lived on a route
no anonymous visitor reaches by default.

**5. Existing Galileo architecture reused unchanged:** `GalileoOrb` (canvas, one rAF loop, DPR
cap, single coherent frame under `prefers-reduced-motion`) · `GalileoPresence` (the persistent
stage) · `orbPresence.orbProfile` (nine states) · `presenceStage.resolvePresence` · the
first-run conversation in `useGalileoConversation` with its auto-start welcome + **canonical
subject question** (`my_business` / `a_client`) and its **canonical intent list** (8 primary +
`not_sure`) · `Business Pulse` signal awakening · the durable intro flag above. **No parallel
architecture was created.**

## IMPLEMENTATION — the sequence

```
SCENE 1  VISION INTRO VIDEO        existing IntroExperience, once per visitor
SCENE 2  VISION BRAND HANDOFF      production wordmark, crossfading in place
SCENE 3  GALILEO APPEARS           existing GalileoOrb, formation, idle
SCENE 4  THE HOOK                  headline → meet → lenses → two-minute hook
SCENE 5  THE INVITATION            "Whose business are we exploring?" + 2 choices
SCENE 6  GALILEO BEGINS LEARNING   acknowledgement → existing intent question → discovery
```

One fixed, near-black surface crossfades between the three phases (`AnimatePresence`, no
`mode="wait"`, so the outgoing frame is still on screen while the next fades in — no blank
frame). There is **no route change, no reload, and no navigation** anywhere in the sequence:
the conversation hook is already mounted underneath, so the handoff is a state change.

**Files added:** `src/lib/galileo/arrivalContent.js` (copy + the durable flag, pure and
assertable), `src/components/galileo/arrival/VisionArrival.jsx` (the three phases),
`.../ArrivalReveal.jsx` (brand + orb + hook + choice), `.../ArrivalAcknowledgement.jsx` (the
post-choice beat), `src/scripts/visionArrival.test.cjs`.
**Files extended:** `IntroExperience.jsx` (poster, `preload="metadata"`, a real wordmark
fallback frame with `Enter VISION`, `showReplay`), `visionBrand.js` (one additive constant: the
wordmark clip window at a larger size), `useGalileoConversation.js` (`autoStart` + a
`startConversation()` that is the *same* start-once body, and the intent question's visible
copy), `GalileoReimagined.jsx` (the arrival branch + the deferred start + the handoff).
**Untouched:** the orb, the presence stage, the question engine, `questionPriorityEngine`,
Business Pulse derivation, the Business Intelligence contract, every authorization, evidence,
document, Digital Twin and storage module. 6D.1B.3 / 6D.1C not started.

## VIDEO

Reused verbatim through the existing component — `VisionArrival` decides only *when* it is
shown. `preload="metadata"` + a poster means the first frame is on screen immediately instead
of the whole file being fetched before anything paints, and **nothing in the application waits
on the media**: Galileo is mounted the entire time. Autoplay is attempted muted + inline; if the
browser refuses, or the media cannot load, the element is replaced by a real brand frame (the
production cinematic backdrop + the production wordmark) with an **Enter VISION** control that
resumes the film when the gesture succeeds and otherwise advances — never a broken player and
never a text approximation of the brand.

## GALILEO

The orb is the existing `GalileoOrb`, composed at the brief's hero band (`ARRIVAL_ORB`:
164 px desktop / 118 px mobile) inside the existing atmospheric glow class. The **formation is
presentational only** (opacity/scale/blur on the wrapper, 1.5 s, removed entirely under
reduced motion) — the orb's own state during the reveal is `idle`, because nothing is running.
On the choice it is `attention` (Galileo is presenting a decision — true), and there is no
`thinking`/`analyzing` anywhere in the arrival: those states remain reserved for real work.
Nothing about the truth contract changed: the orb still receives exactly `state`, `size`,
`intelligence`.

## HOOK — final visible copy

> **See what your business is really capable of.**
> Meet Galileo, your business intelligence.
> Give me a few details about a business and I'll start connecting the dots across profit, cash
> flow, tax, operations, value, and owner freedom.
> In about 2 minutes, I can start showing you **where value may be hiding** and **what may be
> holding the business back**.
> No spreadsheets. No long assessment. Just tell Galileo what you know.
> **Whose business are we exploring?**
> [ My Business — Show me what I'm missing ]  [ A Client — Help me see what they may be missing ]
> No account required to start.

The two emphasised phrases are the only champagne text in the block; the promise is
deliberately "**start showing you**", and the first discovery keeps paying it off through the
existing ANALYZING → converged → single pulse → "I found something worth looking at." sequence.

## CONTINUITY

The arrival's choice flows into the **existing** `selectContext` on the canonical value
(`my_business` / `a_client`), which adds the visitor's own message and asks the **existing**
next question — `client_role` for A Client, otherwise the intent question, whose visible prompt
is now "**What would you most like to uncover?**" with all nine canonical values untouched. The
in-stream start is deferred (`autoStart: false` + a decision in `GalileoReimagined`) so the
subject question is never asked twice, and every other surface — authenticated onboarding, a
restored guest session, `/journey` — starts exactly as it did before (`startConversation()` is
the same start-once body, and a no-op once a session is restored).

## SECURITY

The arrival surface contains no auth call, no upload, no connector and no financial call; the
orb's prop boundary is unchanged and asserted; no value, document, PII, token, signed URL,
business id or evidence can reach the visualization, and nothing is written to analytics, logs,
the DOM or a CSS variable. The durable flag is a single boolean under the **existing**
`vision_intro_completed` key — no identity, no business, no session, nothing security-sensitive.
Canonical actor resolution, business authorization, expert/advisor authorization, row-derived
business scope, Digital Twin authorization, document authorization, evidence trust, entitlement
authority, private storage boundaries and promotion security were not touched.

## AUTOMATED TESTS

`node src/scripts/visionArrival.test.cjs` — **24 checks PASS (V1–V23 subset), 5/5 mutations
APPLIED + BEHAVIOR_CHANGED + CAUGHT** (M-NEWVIDEO, M-TWICE, M-LEAK, M-CLONE, M-COPY), plus the
full re-run, all green: onboarding (O1–O25 + V1–V7), orb presence (P1–P17), presence stage
(21 checks · 4/4 mutations), next best action + continuity, discovery promotion, Pulse
lens/depth, Digital Twin activation safety, document access authorization, architecture guard,
admin route + admin workspace access, and `vite build` exit 0.

## BROWSER ACCEPTANCE — **NOT OBSERVED. NOT CLAIMED.**

The 15-step journey and the four viewports (1440 / laptop / tablet / phone) require a live
browser. Handed to the Testing Agent with these goals: *"As a brand-new anonymous visitor,
watch the VISION intro film and confirm it dissolves straight into the VISION logo and a large
golden Galileo orb with no black pause or reload"*; *"Confirm the headline, the two-minute hook
and Whose business are we exploring all appear above the fold on a laptop, then choose My
Business and confirm Galileo acknowledges before the first question"*; and *"On a phone
viewport, confirm the film is responsive, the orb is roughly 100–135px, the choices stack and
there is no horizontal overflow."*

## BLOCKERS

The visual composition of the arrival (spacing above the fold, the feel of the formation, the
film-to-platform dissolve) is **not verified**. The harness proves sequence, copy, reuse and
boundaries only. `/journey` still uses its own scene layout around the same film and the same
durable flag; it was deliberately left as-is rather than reworked in this pass.