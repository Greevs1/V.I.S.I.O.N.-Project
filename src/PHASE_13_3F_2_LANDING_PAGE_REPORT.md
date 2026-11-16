# Phase 13.3F.2 — Business Valuation Landing Page Redesign

## Overview

Redesigned the Business Valuation landing page from a database-status page into an owner-focused Enterprise Value Dashboard that immediately answers the questions a business owner and advisor care about most.

**No valuation calculations, engine logic, publication, versioning, sharing, permissions, staleness, audit, or business scoping logic was changed.** This phase changes presentation, hierarchy, and interaction only.

---

## Previous Layout

The previous landing page emphasized administrative details:

- "Valuation In Progress" card with status and sharing status
- Six equal-sized generic status cards:
  - Overview (lifecycle status)
  - Data Readiness (availability)
  - Current Version (version count)
  - Published Version (version number)
  - Client Sharing (sharing status)
  - Recent Activity (last updated)
- No enterprise value, no KPIs, no insights, no progress journey, no version comparison
- Archived valuations appeared as the current valuation
- Missing values displayed as "—" or "None"

---

## New Layout

### Hierarchy (top to bottom)

1. **Header** — Business name, "Enterprise Value" label, advisor-only "Details" button
2. **Next Best Action Bar** — One primary action with why/unlocks/owner
3. **Advisor Metrics Bar** (advisor-only) — Verification blockers, stale calcs, missing approvals, missing evidence, conclusion status, publication readiness, client visibility
4. **Enterprise Value Panel** — Primary headline:
   - Enterprise Value (large headline, midpoint + range)
   - Defensible Value (secondary)
   - Potential Value (secondary)
   - Equity Value (visually distinct, accent color)
   - Metadata bar: confidence, date, version, conclusion status, sharing status
   - Workflow state label when no value (never $0)
5. **Owner KPI Cards** — Four compact cards:
   - Normalized EBITDA
   - Valuation Multiple
   - Enterprise Value Gap
   - Equity Value
   - Each shows: metric, value (or workflow state), status, change, explanation, link
6. **Value Insights** — "What Is Driving Your Value":
   - Biggest Value Strength
   - Biggest Value Risk
   - Fastest Value Opportunity
   - Highest-Priority Next Action
   - Each shows: title, why it matters, EBITDA/multiple/EV relevance, confidence, action
7. **Valuation Progress** — Six-stage journey:
   - Discover, Validate, Build Value, Valuation, Growth Plan, Deliverables
   - Each shows: completion %, status dot, blocker badge, progress bar
8. **Value Change Summary** — Version delta:
   - EV, Equity, EBITDA, Multiple, Confidence changes
   - Previous → Current version
   - Primary verified reason
   - "View What Changed" action
   - Calm empty state when no prior version
9. **Valuation History** — Expandable archived valuations section
10. **Valuation Details Drawer** — Administrative details (slide-over)

---

## Owner-Focused Metrics

The landing page prioritizes what owners care about:
- What is the business worth? → Enterprise Value headline
- How confident are we? → Confidence in metadata bar
- What is the defensible/potential value? → Secondary values
- What is holding value back? → Biggest Risk insight
- What is creating value? → Biggest Strength insight
- What should happen next? → Next Best Action bar
- How has value changed? → Value Change Summary
- What information is missing? → Empty state + workflow states
- Who is responsible? → Owner in Next Action bar

---

## Advisor-Specific Additions

Advisors see an additional metrics bar (secondary, not primary):
- Verification blocker count
- Stale calculation count
- Missing approvals
- Missing evidence count
- Advisor conclusion status
- Publication readiness
- Client visibility status

Owner-facing value metrics remain first. The advisor view does not turn back into a technical dashboard.

---

## Empty-State Behavior

When a valuation exists but no approved conclusion exists:

- **Readiness headline**: "Your valuation is X% ready" (from intelligence completion)
- **Already Gathered**: Real counts of financial documents, completed assessments, verified data points
- **Still Needed**: Real missing items from intelligence missing candidates and readiness blockers
- **Primary action**: Continue Discover (navigates to Discover workspace)
- **Secondary action**: Upload Documents (navigates to upload page)
- No fabricated data — all counts come from intelligence and readiness

When no valuation exists:
- Clear "No Business Valuation Yet" state
- "Start Business Valuation" CTA for advisors
- "Your advisor will initiate the valuation process" message for owners

---

## Archived Valuation Behavior

- Archived valuations do not dominate the main owner experience
- If the only valuation is archived: "No Active Valuation" state with:
  - Start New Valuation (advisor-only)
  - View Historical Valuation
- Archived valuations appear in expandable "Valuation History" section
- Each archived entry shows: name, date, EV, version, archive date, shared status, view action
- Archived test data never appears as the current business valuation

---

## Data-Selection Rules

The landing page uses the same data-selection rules as the valuation experience:
- Latest approved non-stale working valuation when no published version exists
- Latest published version when viewing published results
- Approved blended reconciliation for Enterprise Value
- Approved equity bridge for Equity Value
- Approved confidence result
- Approved advisor conclusion
- Not selected by timestamp alone
- Archived data never displayed as current unless explicitly opened from history

---

## Responsive QA

### Desktop
- Main value panel full width
- Four KPI cards in a row
- Insights in a 4-column row
- Progress strip horizontal

### Tablet
- Two-column KPI layout
- Stacked insights (2 columns)
- Progress strip scrolls horizontally

### Mobile
- Enterprise Value first (full width)
- One KPI card per row
- One primary action
- Compact progress strip (horizontal scroll, no overflow)
- Expandable details in drawer
- No horizontal scrolling on the page itself

---

## Regression Results

- **Enterprise Value and Equity Value remain separate** — EV is the headline, Equity is visually distinct with accent color
- **Missing values do not display as zero** — Workflow state labels shown instead
- **Archived test data does not appear as current** — Archived state shown when valuation.status === 'archived'
- **Primary action is correct** — Derived from actual workflow state and permissions
- **Progress is accurate** — Uses real intelligence completion, calculation status, and readiness
- **Version delta is accurate** — Uses version intelligence from insightsEngine
- **Client-safe boundaries remain intact** — Owner view hides internal details
- **Business switching clears prior data** — Data loaded per businessId via useEffect
- **Existing calculations remain unchanged** — No calculation logic modified
- **Existing publication remains unchanged** — No publication logic modified
- **Existing routes remain compatible** — `/advisory/business-valuation` route unchanged

---

## Known Limitations

- **Archived valuations list**: The current backend does not provide a "list archived valuations" API. The ValuationHistory component shows archived valuations when available (e.g., the current valuation if archived). A future phase may add a list-archived endpoint.
- **Version delta percentage**: The percentage delta requires previous absolute values which may not be in the version delta object. When unavailable, only the absolute delta is shown.
- **Intelligence loading on landing page**: The landing page loads intelligence data which adds an extra API call. This is necessary to show real readiness and gathered counts.
- **Advisor metrics bar**: Some metrics (stale calculations, missing approvals) depend on calcSummary data which may not be fully populated for new valuations.

---

## Files Created

- `src/lib/valuation/landingPageEngine.js` — Pure derivation of landing page state
- `src/components/valuation/landing/EnterpriseValuePanel.jsx` — Primary value panel
- `src/components/valuation/landing/OwnerKPICards.jsx` — Four KPI cards
- `src/components/valuation/landing/ValueInsights.jsx` — "What Is Driving Your Value" section
- `src/components/valuation/landing/LandingProgress.jsx` — Six-stage progress strip
- `src/components/valuation/landing/ValueChangeSummary.jsx` — Version delta summary
- `src/components/valuation/landing/ValuationEmptyState.jsx` — Guided starting state
- `src/components/valuation/landing/ValuationHistory.jsx` — Archived valuations
- `src/components/valuation/landing/ValuationDetailsDrawer.jsx` — Administrative details drawer
- `src/components/valuation/landing/AdvisorMetricsBar.jsx` — Advisor-only metrics bar

## Files Modified

- `src/pages/advisory/BusinessValuation.jsx` — Full rewrite as Enterprise Value Dashboard

---

## Status

**READY FOR LANDING PAGE UX REVIEW**