# Assessment to CIQ Dashboard Validation Flow

## Overview
This document describes the validation system that ensures assessment results correctly populate the CIQ dashboard gap cards.

## Problem Solved
Previously, assessments could complete and save without all required fields, resulting in CIQ gap cards showing "—" instead of actual data. This validation system prevents that by:

1. Validating required fields before saving
2. Logging field mappings for debugging
3. Ensuring severity calculations match dashboard expectations

## Components

### 1. `lib/assessmentValidation.js`
Core validation utility with:
- **`validationRules`**: Defines required fields for each assessment type
- **`validateAssessmentResults()`**: Validates results before saving
- **`logValidation()`**: Logs validation results for debugging
- **`preSaveValidation()`**: Wrapper with metadata
- **`mapToDashboardMetrics()`**: Maps results to exact dashboard_metrics JSONB structure

### 2. Assessment Pages (Updated)
Each assessment page now:
1. Imports validation utilities
2. Calls `validateAssessmentResults()` before saving
3. Logs validation results with `logValidation()`
4. Blocks or warns on validation failure

**Updated pages:**
- `pages/assessments/ProfitGap`
- `pages/assessments/ValueGap`
- `pages/assessments/TaxGap`
- `pages/assessments/OperationsGap`

### 3. Backend Function (`functions/saveAssessmentToSupabase`)
Enhanced with:
- Step 5 validation logging
- Explicit field mapping from frontend results to backend fields
- Detailed logging before writing to dashboard_metrics

## Validation Rules by Assessment Type

### Profit Gap
**Required fields:**
- `gapToBest` → maps to `dashboard_metrics.profit_gap.gap_to_best`
- `profitScore` → maps to `dashboard_metrics.profit_gap.score`

**Severity thresholds:**
- Significant: > $500,000
- Moderate: > $100,000
- Low: ≤ $100,000

### Value Gap
**Required fields:**
- `currentValue` → maps to `dashboard_metrics.value_gap.current_value`
- `potentialValue` → maps to `dashboard_metrics.value_gap.potential_value`
- `valueGap` → maps to `dashboard_metrics.value_gap.gap_amount`

**Severity thresholds:**
- Significant: > $500,000
- Moderate: > $100,000
- Low: ≤ $100,000

### Tax Gap
**Required fields:**
- `t3_annual_gap` → maps to `dashboard_metrics.tax_gap.annual_overpayment`
- `t3_strategies` → maps to `dashboard_metrics.tax_gap.opportunities`

**Severity thresholds:**
- Significant: > $500,000
- Moderate: > $100,000
- Low: ≤ $100,000

### Operations Gap
**Required fields:**
- `operations_score` → maps to `dashboard_metrics.operations_gap.score`

**Severity thresholds:**
- Significant: < 45
- Moderate: 45-74
- Low: ≥ 75

## Data Flow

```
Assessment Page (e.g., ProfitGap)
    ↓
User completes assessment
    ↓
handleNext() called
    ↓
validateAssessmentResults('profit_gap', results, state)
    ↓
Checks required fields: gapToBest, profitScore
Calculates severity based on gapToBest amount
    ↓
logValidation('profit_gap', validation)
    ↓
Console logs:
  - [ASSESSMENT_VALIDATION:profit_gap] ✓ Validation passed
  - Severity: moderate
  - CIQ fields that will be written: ['profit_gap.gap_to_best', 'profit_gap.score']
    ↓
saveAssessmentToDB('profit_gap', answers, results)
    ↓
Backend function receives:
  - assessmentType: 'profit_gap'
  - results: { gapToBest: 150000, profitScore: 85, ... }
  - state: { p1_rev: 2000000, p1_mymargin: 15, ... }
    ↓
Backend Step 5: Validates and maps fields
  - Maps gapToBest → gap_to_best
  - Calculates severity
  - Logs: [PROFIT_GAP_WRITE] gapToBest: 150000
    ↓
Backend Step 9: Writes to dashboard_metrics
  - dmPatch.profit_gap = {
      gap_to_best: 150000,
      score: 85,
      severity: 'moderate'
    }
    ↓
CIQ Dashboard reads from dashboard_metrics
  - Card displays: "$150K gap to best-in-class"
```

## Debugging

### When CIQ Card Shows "—"

1. **Check browser console** for validation logs:
   ```
   [ASSESSMENT_VALIDATION:profit_gap] ✗ Validation FAILED
   Missing required fields: ['gapToBest']
   ```

2. **Check backend logs** for write confirmation:
   ```
   [PROFIT_GAP_WRITE] gapToBest: 150000 | gapToAvg: 50000
   [saveAssessment] dashboard_metrics updated, gap field written: profit_gap
   ```

3. **Verify field mapping** in `lib/assessmentValidation.js`:
   - Frontend key: `gapToBest`
   - Backend key: `gap_to_best`
   - CIQ card reads: `assessmentSummary.profit_gap_amount`

### Common Issues

**Issue 1: Field name mismatch**
- Frontend uses `gapToBest`
- Backend expects `gap_to_best`
- Solution: Check mapping in `validationRules.profit_gap.mappings`

**Issue 2: Zero values treated as missing**
- Validation checks `value == null` (allows 0)
- CIQ card checks `value != null` (displays 0)
- Solution: Validation now allows 0 as valid

**Issue 3: Severity calculation wrong**
- Profit/Value/Tax: Based on dollar amount
- Operations: Based on score (inverse logic)
- Solution: Check `severity` calculation in validation

## Testing Checklist

Before deploying assessment changes:

- [ ] Complete assessment with valid data
- [ ] Check console for `[ASSESSMENT_VALIDATION]` logs
- [ ] Verify "Validation passed" message
- [ ] Check backend logs for field write confirmation
- [ ] Navigate to dashboard
- [ ] Verify CIQ card displays actual values (not "—")
- [ ] Verify severity badge matches expected level
- [ ] Test with edge cases (0 values, very large values)

## Future Enhancements

1. **Prevent save on validation failure**: Currently warns but allows save. Could block save entirely.
2. **UI validation feedback**: Show validation errors in assessment UI before allowing "Next".
3. **Auto-fix missing fields**: Attempt to calculate missing values from state before failing.
4. **Validation metrics**: Track validation failure rates per assessment type.

## Related Files

- `lib/assessmentValidation.js` - Validation logic
- `lib/AssessmentContext.jsx` - Save orchestration
- `functions/saveAssessmentToSupabase` - Backend write logic
- `components/dashboard/CIQGapCard` - Dashboard display component
- `pages/Dashboard` - Main dashboard page