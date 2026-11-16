# Phase 4: Galileo Experience Orchestration — Deliverable Report

**Branch:** `architecture-prep`
**Date:** 2026-09-17
**Status:** Implementation complete; pending validation and merge

---

## 1. Executive Summary

Phase 4 transforms the Galileo workspace from a conversation-driven interface into a **fluid, orchestrated intelligent experience**. The conversation remains the control mechanism, but the business model becomes a persistent product on the canvas. An experience state machine infers user mode from behavior — never asking, never showing steps. Subtle contextual surfaces (NOW, Utility Dock, Canvas Objects) provide intelligence without clutter.

**Key shift:** Conversation is the CONTROL. The Business Model is the PRODUCT.

---

## 2. Architecture Overview

```
GalileoShell (persistent, never changes)
  ├── Header: identity + context + inferred mode + model completeness
  ├── NowSurface: one subtle contextual item (only when deserved)
  ├── ConversationStream: the living canvas (center, ~860px)
  │     ├── CanvasObjectsBar: persistent intelligence objects
  │     └── Conversation: collapsed history + active interaction
  ├── LivingBusinessPulse: floating dock with progressive signal awakening
  ├── UtilityDock: Playbook, Sources, Saved, Expert
  └── IntelligenceDrawer: expandable "Show Me Why" + pulse domain zoom
```

The shell never changes. Only the center workspace transforms contextually.

---

## 3. Experience State Machine

**File:** `src/lib/galileo/experienceStateMachine.js`

Eight states inferred from behavior — never shown to the user:

| State | Trigger |
|-------|---------|
| DISCOVER | Initial exploration, gathering context |
| UNDERSTAND | Processing answers, showing why they mattered |
| REVEAL | Surfacing insights (value, profitability, opportunities) |
| INVESTIGATE | User exploring an opportunity deeper |
| CREATE | User exploring strategies/scenarios |
| DECIDE | User choosing an implementation path |
| PRODUCE | User creating a sprint/plan |
| MEASURE | Returning user, tracking progress |

The state machine is **pure** — it derives state from inputs, never mutates them.

---

## 4. Question Priority Engine

**File:** `src/lib/galileo/questionPriorityEngine.js`

Replaces the linear question sequence with information-value-driven selection. Before asking, the engine evaluates:

1. Does Galileo already know this from a connected source?
2. Can Galileo reasonably derive it?
3. Does the answer materially improve the current analysis?
4. Is this the right moment to ask?
5. Can Galileo provide value BEFORE asking another question?

**VALUE → QUESTION rhythm:** After the first 2 questions, Galileo provides value (an observation, benchmark, or insight) before asking the next question. This replaces the QUESTION → QUESTION → QUESTION pattern.

---

## 5. Signal Awakening

**File:** `src/lib/galileo/signalAwakening.js`

Six business signals progressively awaken as Galileo understands the business:

| State | Display |
|-------|---------|
| unknown | "Learning…" (dimmed) |
| learning | "Learning…" (slightly visible) |
| known | Show value (full opacity) |
| interesting | Show value + subtle gold indicator |
| active | Highlighted (user is interacting) |

**Not gamified progress bars** — just quiet, honest signal states that create the feeling of a living model being built.

---

## 6. Canvas Objects

**File:** `src/lib/galileo/canvasObjects.js`

When Galileo discovers an Opportunity, creates a Scenario, or builds a Play, these become **persistent objects on the canvas** — they don't disappear when the conversation scrolls.

Object types:
- **Opportunity** — detected value-creation opportunity
- **Scenario** — before/after strategy model
- **Play** — 90-day sprint preview
- **Benchmark** — profit benchmark established
- **Value Estimate** — preliminary business value

Objects are deduplicated by type + data identity and shown only past discovery.

---

## 7. NOW Surface

**File:** `src/lib/galileo/nowSurface.js`

One subtle contextual item beneath the top bar. Only appears when something genuinely deserves attention. One item at a time. No carousel. No notification clutter.

Priority:
1. Document analysis just completed
2. New opportunity detected
3. Margin observation (above/below typical)
4. Returning user with active sprints
5. Saved items exist

If nothing deserves attention, show nothing.

---

## 8. Save Manager

**File:** `src/lib/galileo/saveManager.js`

Lightweight bookmark/save system. Saving feels natural, not like a separate feature. Session-scoped for anonymous users — no account required to save.

- `saveItem` — saves an item, returns updated list
- `isSaved` — checks if already saved
- `getSavedCount` — count for utility dock badge
- `promoteSavedItemsToSession` — migrates saves during account creation

Save acknowledgment is brief: "Saved." — no modal.

---

## 9. Utility Dock

**File:** `src/components/galileo/shell/UtilityDock.jsx`

Four contextual utilities at the bottom corner:
- **Playbook** — active 90-day plays (badge count)
- **Sources** — accounting/document connections (✓ when connected)
- **Saved** — bookmarked items (badge count)
- **Expert** — expert collaboration

Small, unobtrusive. Everything else is summoned contextually.

---

## 10. Inferred Mode (Creator/Producer)

**File:** `src/lib/galileo/experienceStateMachine.js` → `inferMode()`

Mode is INFERRED from behavior — never a prominent toggle:
- **Creator** — asking questions, exploring, understanding
- **Producer** — creating outputs, implementing, tracking

The ModeIndicator component is extremely subtle, showing only an icon and label.

---

## 11. Preservation Card (Account Creation Magic Moment)

**File:** `src/components/galileo/shell/InsightCards.jsx` → `PreservationCard`

The account creation moment is framed as **preservation of value**, not loss avoidance:

```
Your Business So Far
  Preliminary Value: $5.4M
  Potential Identified: +$1.2M
  Opportunities: 1
  Profit Benchmark: Established
  Business Facts Learned: 18

  [Save My Business — Free]
  Create a free account so Galileo can remember what we've built
  and continue learning over time.
```

---

## 12. Component Inventory

| Component | Path | Purpose |
|-----------|------|---------|
| GalileoShell | `shell/GalileoShell.jsx` | Persistent workspace shell |
| ConversationStream | `shell/ConversationStream.jsx` | Living canvas center |
| LivingBusinessPulse | `shell/LivingBusinessPulse.jsx` | Progressive signal dock |
| IntelligenceDrawer | `shell/IntelligenceDrawer.jsx` | Expandable evidence/scenario/pulse |
| NowSurface | `shell/NowSurface.jsx` | Single contextual attention item |
| UtilityDock | `shell/UtilityDock.jsx` | Playbook/Sources/Saved/Expert |
| CanvasObjectsBar | `shell/CanvasObjectsBar.jsx` | Persistent intelligence objects |
| SaveAffordance | `shell/SaveAffordance.jsx` | Lightweight bookmark button |
| ConnectionSheet | `shell/ConnectionSheet.jsx` | Progressive financial connection |
| ModeIndicator | `shell/ModeIndicator.jsx` | Subtle Creator/Producer indicator |
| InsightCards | `shell/InsightCards.jsx` | Inline insight reveals |
| InlineDocumentFlow | `shell/InlineDocumentFlow.jsx` | Document upload + extraction |

---

## 13. Module Inventory

| Module | Path | Purpose |
|--------|------|---------|
| experienceStateMachine | `lib/galileo/experienceStateMachine.js` | State inference (8 states) |
| questionPriorityEngine | `lib/galileo/questionPriorityEngine.js` | VALUE→QUESTION rhythm |
| signalAwakening | `lib/galileo/signalAwakening.js` | Progressive signal states |
| canvasObjects | `lib/galileo/canvasObjects.js` | Persistent object registry |
| saveManager | `lib/galileo/saveManager.js` | Session-scoped saves |
| nowSurface | `lib/galileo/nowSurface.js` | NOW item selector |

---

## 14. Validation Scenarios

### Scenario A: First-time guest, no documents
1. Navigate to `/galileo`
2. Select "My Business" → select an intent
3. Answer industry, revenue, EBITDA
4. **Expected:** VALUE→QUESTION rhythm; signals awaken progressively; opportunity appears; preservation card shows summary

### Scenario B: Guest with document upload
1. Complete discovery questions
2. Click "Share Financials" → upload a P&L
3. **Expected:** Extraction runs inline; model updates; value signal shows "updated"; new opportunity surfaces

### Scenario C: Returning authenticated user
1. Log in → navigate to `/galileo`
2. **Expected:** Dashboard link visible; mode infers PRODUCE if sprints exist; NOW surface shows active plays

### Scenario D: Save affordance
1. When an opportunity or scenario appears, click "Save"
2. **Expected:** Brief "Saved." acknowledgment; UtilityDock Saved badge increments

### Scenario E: Pulse domain investigation
1. Click a signal in the LivingBusinessPulse dock
2. **Expected:** IntelligenceDrawer opens with domain detail; signal shows ACTIVE state

### Scenario F: Canvas object persistence
1. Progress past discovery to opportunity stage
2. Scroll conversation
3. **Expected:** Canvas objects remain visible at top; conversation history collapses

---

## Next Steps

1. **Validate** all 6 scenarios in the preview
2. **Merge** `architecture-prep` into main
3. **Finalize** expert collaboration handoff brief generation logic
4. **Publish** from main branch