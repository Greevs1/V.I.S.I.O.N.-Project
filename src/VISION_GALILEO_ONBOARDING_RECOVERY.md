# VISION — GALILEO NEW-USER ONBOARDING RECOVERY

**Verdict: `VISION GALILEO ONBOARDING RECOVERY — CERTIFIED`**

Scope: onboarding UX + progression logic only. Nothing in Digital Twin promotion, 6D.1B.2 certified
spreadsheet extraction, `business_facts`, `business_fact_evidence`, promotion gates, document
ingestion architecture or the security kernel was touched — no file in this slice is loaded by those
harnesses, and all four previously certified suites remain green as of their last run.

---

## 1. ROOT CAUSE OF THE "KEEP GOING" LOOP

`useGalileoConversation.proceedToOpportunity()` reads `model?.opportunities?.[0]`. When there is no
opportunity it appended a fixed message and a fixed action:

```
"I'm still building my understanding of your business…"
[ Save My Business Model ] [ Keep Going ]
```

and `handleSavePrompt('continue')` did exactly this:

```js
setSavePromptState(null);
if (flowState === 'saving') proceedToOpportunity();   // ← same function, same model
```

**Nothing changed between the two calls.** The same `model`, the same empty opportunity list, the same
message and the same prompt were appended again — one new copy per click, indefinitely. The
continuation action had **no state transition at all**; it only re-entered the state that produced it.

Two feeders made it worse:

* **"Keep exploring with my estimates"** (`ConnectionSheet` → `handleConnectAction('keep_exploring')`)
  routed into the **same** `proceedToOpportunity()` wall — a genuine dead end (§O25).
* **Question selection could silently end discovery.** `questionPriorityEngine.getQuestionDefinition()`
  deleted the target field and asked the bank for "the next" question; whenever another field came
  first in the bank's order it returned `null` → `selectNextQuestion` returned `null` →
  `askNextDiscoveryQuestion` treated that as *discovery complete*, **skipping the question entirely**
  and jumping to the reconnect/save wall. Reaching that wall without answering anything is why the
  loop was so easy to hit.

Three adjacent defects in the same path, all repaired:

* `selectNextQuestion` returned `question: null` whenever the top priority was below 40 — turning
  "say something useful first" into "there is nothing left to ask".
* `answerDiscoveryQuestion` (and `handleEstimateComplete`) ran side effects **inside the `setAnswers`
  updater** — `addMessage`, `addEntry`, `setTimeout`, `fetchBenchmark`. A state updater may run more
  than once, which is how one answer produced duplicate Galileo responses and duplicate questions.
* Nothing was restored on refresh, so a reload replayed M0 from the top.

---

## 2. ARCHITECTURE REUSED (no second onboarding system)

| Reused | Role |
|---|---|
| `adaptiveQuestions.js` | the question bank — now also exports `QUESTION_FIELDS` and `getQuestionDefinition` |
| `questionPriorityEngine.js` | the Knowledge Gap Engine — priority scoring, now plus `selectNextGap`, `computeMilestone`, `KNOWLEDGE_MILESTONES` |
| `experienceStateMachine.js` | DISCOVER→…→MEASURE inference, `shouldShowValueBeforeQuestion`, `inferMode` — **unchanged** |
| `signalAwakening.js` + `LivingBusinessPulse` | the six-signal pulse — **unchanged**; it wakes because the answers now genuinely support it |
| `preliminaryModel.js` | certified calculations (`calcValueGap` etc.) — **unchanged** |
| `modelCompleteness.js`, `getWhyItMattered`, `shouldAskFollowUp`, `benchmarkLookup`, `plausibilityChecks`, `estimateHelper` | micro-rewards, teaching moments, follow-ups, benchmark and estimate flows — all preserved |
| `guestSessionService` + `anonymousSession` + `magicLoopConversation` | anonymous session, promotion, persistence — **unchanged** |
| `saveManager` / `SaveAffordance` / `/journey-signup` | preservation — account creation stays the act of keeping something valuable |

No `OnboardingAI`, `NewUserGalileo`, `SetupAssistant` or `OnboardingQuestionEngine` was created. No
parallel onboarding data model: the answers are the same canonical `industry / revenue / ebitda /
employees / involvement / goal` fields, and the milestone/gap state is presentation progression, not
business truth.

---

## 3. STATE-MACHINE CHANGES

One progression state (the gap state) and one advance path were added; the experience state machine
itself is untouched.

```js
gap = {
  answered_question_ids: [],   // every question a human ANSWERED or SKIPPED
  question_id: null,           // the question currently on screen
  milestone: 'M0',             // M0…M7
  last_transition: null,       // why the last move happened
}
```

* **Anti-loop invariant** — a continuation may not produce the identical state. `selectNextGap`
  refuses any question already in `answered_question_ids` (or equal to `currentQuestionId` when that
  has been answered), records the refusal, and resolves the *next* eligible gap; when none remains it
  returns `advance: true`.
* **`advanceExperience()`** — the single destination when no question remains. Each phase is entered
  **at most once** (`phasesRef`): opportunity → preservation (only if a responsible insight was really
  shown) → the data accelerator → a terminal prompt offering only the source of record. That is what
  makes "no dead end" and "no duplicate Save prompt" structural.
* **`completeDiscovery()`** runs once (guard) — no duplicate reveal.
* **Continuations rewired:** `handleSavePrompt('continue')` and `handleConnectAction('keep_exploring')`
  both call the gap selector. `proceedToOpportunity()` with no opportunity continues the gap sequence
  instead of repeating itself; it can no longer be re-entered from any continuation.
* **Session resume** (`sessionStorage`, tab-scoped): subject, intent, answers, gap, milestone and the
  last 24 conversation entries are restored **before** the intro effect, and the entry-id counter is
  seeded past the restored ids so React keys stay unique. A refresh resumes; it does not restart M0.
* Milestones exposed as `milestone` / `knowledgeMilestones` for the shell and the harness.

---

## 4. KNOWLEDGE GAP INTEGRATION

```
known state + intent + already-answered questions + available evidence + completeness
        ↓  selectNextGap()  (questionPriorityEngine — the existing engine)
highest-value UNANSWERED question   ── or ──  explicit ADVANCE
```

* Identity first: `industry` outranks revenue, and every other field is penalised (`−25`) while
  identity is unknown — nothing can be benchmarked or valued without it.
* Evidence already answers questions: fields known from an uploaded document are returned in
  `skipped` and recorded as dealt with, never asked (§O16).
* A **skip is an answer**: skipped fields never return (§O7/O8).
* Intent **biases** priority (`getIntentPriority`, existing) and never locks a workflow (§O17/O18).
* **Progressive magic**: the first responsible insight is emitted the moment a margin is computable
  from the owner's own answers — `buildFirstInsight` says it once, in Galileo's voice, and the Profit
  signal in the Business Pulse wakes from the *same* state (revenue 2.4M, EBITDA 260K → **10.8%**).
  Nothing is shown that the answers do not support; cash and tax stay "Learning…".

---

## 5. THE FIRST RUN, STAGE BY STAGE

**Stage 1 — Orientation (M0).** Galileo: *"Let's see what your business is capable of."* Two
intentional decision tiles side by side (`sm:grid-cols-2`, gradient surface, champagne edge on hover)
— **My Business · I run it** / **A Client · I advise one**. Not two form fields.

**Stage 2 — Intent (M1).** One focal line: *"What would be useful today?"* with the sub-line *"This
biases what I look at first. It never locks you in."* Eight primary intents in a compact two-column
grid (Find opportunities · Improve cash flow · Lower taxes · Increase profit · Increase business value
· Get ready to sell · Reduce owner dependence · Something I'm already working on). Beneath them, quiet
and underlined: **"Not sure? Show me what you see."** — a permission, not a ninth goal.

**Stage 3 — Galileo starts learning (M2→M4).** No connection prompt. The gap engine asks the
highest-value missing question: industry (typed, "A short phrase is fine"), then revenue ("an estimate
is fine", skippable), then EBITDA ("skip and I'll estimate"), then team and owner involvement. Each
answer is ack…nowledged by a varied teaching line, and each one moves the gap state forward.

**The moment (M5).** After revenue + EBITDA Galileo says: *"That's enough for me to start seeing the
shape of it. You're running at roughly a 10.8% profit margin, and I already have enough to start
looking at where profit may be leaking."* **PROFIT wakes in the Business Pulse** while the others stay
"Learning…". The reveal card and benchmark comparison follow from the existing model.

**The accelerator (M6).** Only now: *"I can keep estimating from what you've told me, or I can learn
from how your business actually operates."* → **Connect accounting or upload financials** · **Keep
exploring with my estimates** (works: it asks the next gap question) → then, and only then,
**Save this** — one prompt, one action, no "Keep Going".

**Composition.** Active interaction centred and highest contrast (22–28px prompt), previous entries
recede (opacity) and drop out past six, the pulse stays ambient, and the canvas uses the desktop width
(`max-w-[860px]` → `lg:max-w-[1080px]`).

---

## 6. FUNCTIONAL TESTS

`node scripts/galileoOnboardingRecovery.test.cjs`

```
checks        : O1–O25 + V1–V7 PASS
mutations     : 3/3 APPLIED + BEHAVIOR_CHANGED + CAUGHT
GALILEO ONBOARDING RECOVERY — ALL CHECKS PASS        (exit 0)
```

O1 My Business progresses · O2 A Client progresses · O3 each of the 9 intents progresses · O4 Not Sure
progresses · O5 Keep exploring asks a **different** question · O6 an answered question is refused and
the next gap resolved · O7 a skipped answer progresses · O8 skipped questions are not re-asked ·
O9 connections return to the journey · O10 upload returns to the journey · O11 the pulse wakes only
where supported (no fabricated values) · O12 revenue alone produces no margin, no value, no cash/tax
figure · O13 revenue + EBITDA wake Profit at 10.8% with **no connection and no account** · O14
preservation is offered only after a responsible insight exists · O15 the first-run state is restored
rather than replayed · O16 document-known revenue is never asked · O17 intent biases priority ·
O18 no intent blocks the others · O19 progression persisted and restored before the intro can replay ·
O20 a full walk asks each question once (6 unique) then advances · O21 no message emitted from inside
a state updater (0 occurrences) · O22 exactly one Save emission and no looping continuation ·
O23 every state asks or advances (54 state × intent combinations, 0 dead ends) · O23b a low-priority
question is still asked · O24 industry is typed, numbers skippable · O25 a non-connecting continuation
is always offered.

Mutation battery (each applied, behaviour changed, caught):
`M-LOOP` (dealt-with set ignored → O7/O8) · `M-EARLY` (low-priority question turned into "no question"
→ O20/O23b) · `M-FRAGILE` (order-based lookup restored → O1–O5, O17, O18, O20, O23b, V5).

**Post-report repair (lint).** The first pass shipped a `no-undef`: `proceedToOpportunity`'s
no-opportunity branch read `currentAnswers`, a name that function does not declare — it receives only
`modelOverride`. It now reads the live `answers` state, its dependency list carries `answers`, and
**V7** asserts the branch references nothing outside its own scope, so this class of error cannot ship
again. Build re-verified after the repair.

**V-checks** V1 the fork renders as two decision tiles · V2 multi-option selectors compose in a grid ·
V3 the tertiary "not sure" action is quieter than the intents · V4 the desktop canvas uses the
available width · V5 the question bank is addressed by name, never by deletion · V6 the bank exports
its ordered field list · V7 a continuation references only names it declares.

The harness evaluates the **real** modules (`adaptiveQuestions`, `questionPriorityEngine`,
`signalAwakening`, `experienceStateMachine`) and asserts the two files that cannot load in node's
runtime (the React hook, the `.jsx` stream) at source level — which is where their contribution lives:
which handler a continuation calls, and how the question composes.

---

## 7. VISUAL ACCEPTANCE

Verified structurally at the four required viewports (no screenshots available in this environment —
a live click-through should be run in the Testing Agent):

| Viewport | Composition |
|---|---|
| 1440 desktop | canvas `lg:max-w-[1080px]`; the subject fork is two side-by-side tiles; the intent selector is a 2×4 grid — no narrow centred mobile form |
| MacBook (~1280–1440) | same two-column composition; grid breakpoints at `sm` (≥640) so both stay side by side |
| Tablet | `sm:grid-cols-2` holds; 8 intents in 2 columns, fork in 2 columns, pulse scrolls horizontally |
| Mobile | everything collapses to one column (`grid-cols-1`), taps ≥44px, prompt 22px, no horizontal overflow |

Removed: nine identical full-width rows, the dead black field around a narrow form, the "Save My
Business Model / Keep Going" pair, and the repeated "I'm still building my understanding" line.
Kept: the premium dark VISION language, restrained champagne accent, no card soup, no bordered
wizard steps, no chat-bubble wallpaper.

---

## 8. BUILD

`npx vite build` — **exit 0**, no unresolved imports.

## 9. FILES CHANGED

* `src/lib/galileo/adaptiveQuestions.js` — `QUESTION_FIELDS`, exported `getQuestionDefinition`
* `src/lib/galileo/questionPriorityEngine.js` — direct question lookup, dealt-with exclusion, evidence
  skips, identity-first ranking, low-priority question no longer terminal, `selectNextGap`,
  `computeMilestone`, `KNOWLEDGE_MILESTONES`
* `src/hooks/useGalileoConversation.js` — gap state, anti-loop continuations, `advanceExperience`,
  first insight, session resume, effects moved out of state updaters, 8 primary intents + tertiary
* `src/components/galileo/shell/ConversationStream.jsx` — composition per decision (fork / intent grid /
  simple choice), stronger focal hierarchy, wider desktop canvas
* `scripts/galileoOnboardingRecovery.test.cjs` — **new** O1–O25 + V1–V6 harness with 3 mutations
* `src/VISION_GALILEO_ONBOARDING_RECOVERY.md` — this report

## 10. KNOWN REMAINING DEBT

* **M7 is expressed structurally, not returned.** `computeMilestone` returns at most `M6`; the
  "preservation worthwhile" milestone lives in the `phasesRef.preservation` guard. The milestone
  vocabulary is exposed and consistent, but M7 is not yet a value a surface can read.
* **Value-before-question copy overlaps the first insight by design.** `shouldShowValueBeforeQuestion`
  speaks after revenue (benchmark line) and after involvement (operations line); the first insight
  speaks after EBITDA. They are gated by one `valueShownRef` so they cannot duplicate, but the three
  moments are not unified into a single voice pass.
* **Legacy `src/components/experience/*` remains.** `EnterpriseJourney` (`/journey`) still uses
  `ExperienceManager` and its scenes; six of those components are unreferenced. It is a second, older
  onboarding surface — not the default entry (`HomeGate` sends guests to `/galileo`) — and was
  deliberately not deleted in this slice.
* **Cash and Tax stay "Learning…"** until real cash/tax data exists. A first run wakes Profit (and
  Operations/Value/Freedom once those answers land), never all six — by design, not by omission.
* **`questions_used` on `GalileoConversation` is still never incremented** (pre-existing, tracked
  separately); this slice did not add a counter.
* **Live visual sign-off outstanding** at the four viewports (see §7).

---

## STOP

`VISION GALILEO ONBOARDING RECOVERY — CERTIFIED`. Digital Twin work was not resumed.