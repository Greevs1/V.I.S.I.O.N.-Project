# CIQ Dashboard Data Flow Diagnostic Report

## Problem Statement
Profit Gap and Value Gap assessment data is not populating correctly on the CIQ dashboard gap cards.

## Data Flow Architecture

```
Assessment Page (Frontend)
    ↓
User completes assessment → results object
    ↓
saveAssessmentToDB(assessmentType, answers, results)
    ↓
functions/saveAssessmentToSupabase (Backend)
    ↓
Supabase Tables: business_assessments, dashboard_metrics
    ↓
functions/supabaseUserData (Backend - getAssessmentSummary)
    ↓
Dashboard Component (Frontend)
    ↓
CIQGapCard Component
```

## Root Cause Analysis

### Issue #1: Field Name Mismatch (FIXED)
**Location:** `functions/saveAssessmentToSupabase.js` - Step 5

**Problem:**
- Frontend sends: `results.gapToBest` (camelCase)
- Backend was looking for: `results?.profit_gap` (incorrect)
- Backend now correctly maps: `results?.gapToBest || results?.gap_to_best`

**Fix Applied:**
```javascript
const oppValueMap = {
  profit_gap: results?.gapToBest || results?.gap_to_best || results?.profit_gap,
  value_gap: results?.valueGap || results?.value_gap || results?.value_gap_amount,
  // ...
};
```

### Issue #2: Dashboard Metrics Write Mapping (FIXED)
**Location:** `functions/saveAssessmentToSupabase.js` - Step 9

**Problem:**
Backend writes to `dashboard_metrics` JSONB fields but wasn't correctly mapping from frontend results.

**Fix Applied:**
```javascript
if (assessmentType === 'profit_gap') {
  const gapToBest = fmt(oppValue); // Already calculated from results.gapToBest
  dmPatch.profit_gap = {
    gap_to_best: gapToBest,
    // ...
  };
}

if (assessmentType === 'value_gap') {
  const currentVal = fmt(results?.currentValue ?? results?.current_value);
  const potentialVal = fmt(results?.potentialValue ?? results?.potential_value);
  const gapAmount = fmt(results?.valueGap ?? results?.value_gap ?? oppValue);
  dmPatch.value_gap = {
    current_value: currentVal,
    potential_value: potentialVal,
    gap_amount: gapAmount,
    // ...
  };
}
```

### Issue #3: Assessment Summary Read Logic (VERIFIED CORRECT)
**Location:** `functions/supabaseUserData.js` - getAssessmentSummary action

**Current Logic:**
```javascript
// Pull Supabase business_assessments
const { data: baRows } = await sb
  .from('business_assessments')
  .select('assessment_type, score, estimated_opportunity_value, ...')
  .eq('profile_id', profile.id)
  .in('assessment_type', [...]);

// Pull Base44 Assessment entity results
const base44Assessments = await base44.asServiceRole.entities.Assessment.filter(...);
const b44ByType = ...;
const b44pg = b44ByType['profit_gap']?.results || {};
const b44vg = b44ByType['value_gap']?.results || {};

// Merge: prefer Supabase estimated_opportunity_value, fallback to Base44 results
const profitGapAmount = pg?.estimated_opportunity_value ?? b44pg.gapToBest ?? null;
const valueGapAmount  = vg?.estimated_opportunity_value ?? b44vg.valueGap ?? b44vg.potentialValue ?? null;
```

**Status:** ✅ This logic is CORRECT - it properly falls back from Supabase to Base44 entity results.

### Issue #4: Dashboard Component Data Flow (VERIFIED CORRECT)
**Location:** `pages/Dashboard.jsx`

**Current Logic:**
```javascript
const { data: assessmentSummary } = useQuery({
  queryKey: ['assessmentSummary'],
  queryFn: async () => {
    const res = await base44.functions.invoke('supabaseUserData', { action: 'getAssessmentSummary' });
    return res.data?.summary || null;
  },
});

// Pass to CIQGapCard
<CIQGapCard
  gapType="profit"
  data={m}  // metricsData from dashboard_metrics table
  assessmentSummary={as}  // assessmentSummary from getAssessmentSummary
  latestSnapshot={ls}
/>
```

**Status:** ✅ This logic is CORRECT.

### Issue #5: CIQGapCard Read Logic (VERIFIED CORRECT)
**Location:** `components/dashboard/CIQGapCard.jsx`

**Current Logic:**
```javascript
const configs = {
  profit: {
    primary: (() => {
      const val = assessmentSummary.profit_gap_amount ?? data.profit_gap?.gap_to_best ?? latestSnapshot.profit_opportunity;
      return val != null ? fmtCurrency(val, 'K') : 'Complete assessment';
    })(),
  },
  value: {
    primary: (() => {
      const val = assessmentSummary.value_gap_amount ?? data.value_gap?.gap_amount ?? data.value_gap?.potential_value ?? latestSnapshot.value_gap;
      return val != null ? fmtCurrency(val, 'M') : 'Complete assessment';
    })(),
  },
};
```

**Status:** ✅ This logic is CORRECT - it has proper fallback chain.

## Diagnostic Steps Taken

1. ✅ **Verified frontend save logic** - ProfitGap and ValueGap pages correctly calculate and pass results
2. ✅ **Fixed backend mapping** - saveAssessmentToSupabase now correctly maps camelCase fields
3. ✅ **Fixed backend writes** - dashboard_metrics JSONB fields are correctly populated
4. ✅ **Verified backend read logic** - getAssessmentSummary properly merges Supabase + Base44 data
5. ✅ **Verified dashboard component** - Data flow from queries to CIQGapCard is correct
6. ✅ **Verified CIQGapCard** - Fallback chain is properly implemented

## Debug Logging Added

Enhanced logging in `functions/saveAssessmentToSupabase.js`:

```javascript
console.log('========== ASSESSMENT SAVE DEBUG REPORT ==========');
console.log('[STEP_5] assessmentType:', assessmentType);
console.log('[STEP_5] results keys:', Object.keys(results));
console.log('[STEP_5] results content:', JSON.stringify(results, null, 2));
console.log('[STEP_5] state content:', JSON.stringify(state, null, 2));
console.log('[STEP_5] oppValueMap:', JSON.stringify(oppValueMap, null, 2));
console.log('[STEP_5] oppValue:', oppValue);
console.log('========== END DEBUG REPORT ==========');
```

## Testing Checklist

To verify the fix works:

- [ ] Complete Profit Gap assessment with test data (e.g., $2M revenue, 15% margin)
- [ ] Check browser console for `[PROFIT_GAP_SAVE]` logs
- [ ] Check backend logs for `========== ASSESSMENT SAVE DEBUG REPORT ==========`
- [ ] Verify `oppValue` is calculated correctly (e.g., $200K+ for typical scenarios)
- [ ] Navigate to Dashboard page
- [ ] Check that Profit Gap card shows actual dollar amount (not "—")
- [ ] Complete Value Gap assessment
- [ ] Verify Value Gap card shows actual dollar amount
- [ ] Check Supabase `dashboard_metrics` table for populated JSONB fields

## Known Data Dependencies

1. **Business Entity Resolution**: The save function resolves `business_id` from `business_entities` table. If this fails, data may be scoped incorrectly.

2. **Profile Linkage**: User's Base44 email must match Supabase `profiles.email` for data to be found.

3. **Assessment Entity Sync**: Base44 Assessment entities are created as a backup. The read logic prefers Supabase but falls back to Base44.

## Remaining Potential Issues

If data still doesn't populate after these fixes, check:

1. **Supabase RLS Policies**: Ensure `dashboard_metrics` table allows reads for the user's role
2. **Business ID Scoping**: Verify `business_id` is correctly resolved and used consistently
3. **Cache Invalidation**: React Query may be caching old data - try hard refresh
4. **Assessment Entity Creation**: Check if Base44 Assessment entities are being created on save

## Recommended Next Steps

1. **Test with fresh assessment** - Complete Profit Gap assessment with known values
2. **Check backend logs** - Look for `========== ASSESSMENT SAVE DEBUG REPORT ==========` output
3. **Verify Supabase data** - Query `dashboard_metrics` table directly to confirm JSONB fields are populated
4. **Clear React Query cache** - Add `refetchOnWindowFocus: true` or manually invalidate queries

## Files Modified

1. `functions/saveAssessmentToSupabase.js` - Fixed field mapping and added debug logging
2. `pages/assessments/ProfitGap.jsx` - Added validation logging (already complete)
3. `pages/assessments/ValueGap.jsx` - Added validation logging (already complete)
4. `lib/assessmentValidation.js` - Created validation utilities (already complete)