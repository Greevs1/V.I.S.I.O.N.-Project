# Phase 3.2: Next Best Action Engine - Implementation Summary

## Overview
Created a Next Best Action system that selects the highest-value, most actionable next step for business owners.

## Components Created

### 1. Supabase Table Schema
**File:** `supabase/migrations/next_best_actions.sql`

**Table:** `next_best_actions`
- **Fields:** id, business_id, profile_id, title, description, action_type, category, priority_score, estimated_impact, expected_time_days, difficulty_level, reason, source, source_record_id, status, due_date, assigned_to, created_at, updated_at, accepted_at, dismissed_at, dismissed_by, completed_at
- **Statuses:** recommended, accepted, in_progress, completed, dismissed
- **RLS Policies:** Owners view own actions, advisors view assigned businesses, super admins full access

### 2. Backend Functions

#### `generateNextBestActions` (functions/generateNextBestActions)
**Purpose:** Selects highest-value, most actionable next steps

**Rules Implemented:**
1. Data clarification > In-progress work > New opportunities > Assessments
2. Never recommend dismissed actions
3. Score by: priority, confidence, effort, recency
4. Owners see only primary action with simple explanation
5. Advisors/admins see all candidates with scoring logic

**Priority Order:**
1. **Extracted fields needing clarification** (priority: 95)
2. **In-progress roadmap items** (priority: 85)
3. **Business opportunities** (scored by algorithm)
4. **Fallback:** Complete first assessment or upload documents

**Scoring Formula:**
```
actionabilityScore = priority_score (base)
  + 10 if confidence >= 80%
  + 5 if confidence >= 90%
  + 15 if effort_level = 'low'
  + 5 if effort_level = 'medium'
  - 20 if opportunity_type previously dismissed
```

#### `supabaseUserData` Actions (functions/supabaseUserData)
Added 4 new actions:
- `getNextBestAction` - Fetch primary + secondary actions (owners see only primary)
- `acceptNextBestAction` - Set status = accepted
- `dismissNextBestAction` - Set status = dismissed
- `resetNextBestAction` - Advisor-only: reset dismissed to recommended
- `getAllNextBestActions` - Advisor-only: fetch all candidate actions

### 3. Frontend Components

#### Owner View (components/dashboard/NextBestActionOwner)
**Location:** Dashboard page (top section, after onboarding)

**Features:**
- Shows only PRIMARY action to owners
- Displays: title, why it matters, estimated impact, expected time, difficulty badge
- Actions: Accept, Dismiss, View Details
- Auto-refresh every 60 seconds
- Handles fallback cases (onboarding required, no data)

**UI Elements:**
- Priority score badge (color-coded: green >= 80, yellow >= 60)
- Difficulty badge (easy/medium/hard)
- Estimated impact in $K
- Expected time in days
- Expandable details section with metadata

#### Advisor View (components/admin/NextBestActionsAdvisor)
**Location:** Admin View → "Next Best Actions" tab

**Features:**
- Shows ALL candidate actions (up to 10)
- Displays scoring logic and metadata
- Color-coded priority scores
- Status badges (recommended/accepted/in_progress/completed/dismissed)
- Advisor-only "Reset to Recommended" button for dismissed actions
- Shows full scoring details in expandable sections

### 4. Dashboard Integration

**File:** `pages/Dashboard`
- Added NextBestActionOwner component after onboarding section
- No redesign of existing dashboard layout
- Minimal, focused section

**File:** `pages/admin/AdminView`
- Added new "Next Best Actions" tab
- Uses Target icon
- Renders NextBestActionsAdvisor component

## Decision Logic Flow

```
1. Check for extracted fields needing clarification
   └─> If found: "Clarify Extracted Data" (priority: 95)

2. Check for in-progress roadmap items
   └─> If found: "Complete: [Roadmap Item]" (priority: 85)

3. Fetch business_opportunities (status = identified)
   └─> Filter out dismissed titles
   └─> Score by: priority + confidence + effort - dismissed_types
   └─> Sort by priority_score DESC
   └─> Select top 1 as primary, next 3 as secondaries

4. Fallback checks:
   ├─> No assessments completed? → "Complete Your First Assessment"
   └─> No data at all? → "Upload Financial Documents"

5. No actions available? → "Review Business Metrics" (wait for analysis)
```

## Status Transitions

```
recommended 
  ├─> accepted (user clicks "Accept")
  │     └─> in_progress (manual roadmap update)
  │           └─> completed (roadmap item verified)
  └─> dismissed (user clicks "Dismiss")
        └─> recommended (advisor resets)
```

## Fallback Behaviors

1. **No business linked:** Returns `fallback: 'onboarding_required'`
2. **No data available:** Recommends first assessment or document upload
3. **No opportunities generated:** Shows "Review Business Metrics" placeholder
4. **All actions dismissed:** Shows empty state with guidance

## Key Features

### Owner Experience
- ✅ Single, clear recommendation
- ✅ Simple explanation (no complex scoring)
- ✅ Quick accept/dismiss actions
- ✅ Optional details view
- ✅ Never sees dismissed actions again (unless advisor resets)

### Advisor Experience
- ✅ Full visibility into all candidate actions
- ✅ Scoring logic and metadata exposed
- ✅ Can reset dismissed actions
- ✅ Can see why each action was recommended
- ✅ Filterable by status, category, priority

### System Behavior
- ✅ Prioritizes data clarification over new work
- ✅ Focuses on completing active initiatives
- ✅ Avoids recommending dismissed actions
- ✅ Doesn't invent dollar values (uses existing estimates)
- ✅ Filters by business_id (RLS-safe)
- ✅ Auto-refreshes every 60 seconds

## Testing Recommendations

1. **Test with no data:** Verify fallback to "Complete Assessment"
2. **Test with pending fields:** Verify "Clarify Extracted Data" appears first
3. **Test with in-progress roadmap:** Verify completion recommended before new work
4. **Test duplicate prevention:** Dismiss action, verify it doesn't reappear
5. **Test advisor reset:** Advisor resets dismissed action, verify it reappears for owner
6. **Test scoring:** Verify high-priority, low-effort actions rank higher

## Migration Required

Run the SQL migration in `supabase/migrations/next_best_actions.sql` to create the table.

## Future Enhancements (Not Implemented)

- [ ] Link accepted actions to roadmap items automatically
- [ ] Email notifications for new recommendations
- [ ] Scheduled re-evaluation (e.g., weekly)
- [ ] A/B testing on recommendation wording
- [ ] Owner can defer actions (snooze for 7 days)
- [ ] Advisor can add custom recommendations
- [ ] Machine learning on acceptance/dismissal patterns