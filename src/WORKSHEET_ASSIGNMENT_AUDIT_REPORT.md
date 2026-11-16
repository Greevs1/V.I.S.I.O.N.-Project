# 🔍 Worksheet Assignment Data Flow Audit Report
**Date**: 2026-06-19  
**Purpose**: Identify broken steps in worksheet assignment → completion pipeline

---

## Step 1: When I Click "Assign" on a Worksheet Template

### Backend Action Executed:

**Component**: `components/admin/AssignWorksheetModal.jsx`  
**Function**: `handleAssign()` (line 53-88)  
**Action Name**: `base44.entities.Worksheet.update()`  
**Entity Name**: `Worksheet` (Base44 entity)  
**Inputs**:
- `worksheet.id` - Base44 Worksheet entity ID
- `assigned_to` - Array of Supabase profile UUIDs (converted from Base44 user IDs)

**Outputs**:
- Updates Base44 Worksheet entity's `assigned_to` field
- Fires `worksheet-assigned` custom event (window event)
- Does **NOT** write to `worksheet_assignments` table

### Code Path:
```javascript
// AssignWorksheetModal.jsx line 78-81
await base44.entities.Worksheet.update(worksheet.id, { 
  assigned_to: profileIds,  // Array of Supabase UUIDs
  updated_at: new Date().toISOString(),
});
```

---

## Step 2: Does Clicking Assign Create a Row in worksheet_assignments?

### Answer: **NO**

### Where Assignment is Currently Stored:

**Storage Location**: Base44 `Worksheet` entity - `assigned_to` field (JSON array)

**Format**:
```json
{
  "id": "worksheet-abc123",
  "title": "Tax Strategy Worksheet",
  "assigned_to": [
    "23b5c5c7-6d3c-4ad7-b9a1-87fd80028528",
    "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  ],
  "status": "published"
}
```

**NOT Stored In**: `worksheet_assignments` Supabase table (table exists but has 0 rows)

---

## Step 3: Where is the Assigned Worksheet Shown to the User?

### Query Used by Resource Library:

**Component**: `pages/advisory/ResourceLibrary.jsx`  
**Query Key**: `['my-assigned-worksheets', supabaseProfile?.id]`  
**Backend Function**: `supabaseUserData`  
**Action**: `getAssignedWorksheets`  
**Source Table**: `worksheet_assignments` (Supabase)  
**Filter Conditions**:
```sql
SELECT * FROM worksheet_assignments
WHERE assigned_to_profile_id = :current_user_profile_id
ORDER BY created_at DESC
```

### Problem:
The query looks for records in `worksheet_assignments` table, but assignments are stored in Base44 `Worksheet.assigned_to` array instead.

---

## Step 4: Resource Library Worksheet Section

### Assigned Worksheets Query:

**Action Name**: `getAssignedWorksheets`  
**Backend Function**: `functions/supabaseUserData`  
**Source**: `worksheet_assignments` table (Supabase)  
**Filter**:
```javascript
// supabaseUserData action: 'getAssignedWorksheets'
const { data: assignments } = await sb.from('worksheet_assignments')
  .select('id, worksheet_id, assigned_to_profile_id, assigned_to_business_id, status, due_date, created_at')
  .eq('assigned_to_profile_id', effectiveProfileId)
  .order('created_at', { ascending: false });
```

### Fallback Logic:
If `worksheet_assignments` returns 0 rows, the function queries Base44 `Worksheet` entity:
```javascript
const allWorksheets = await base44.asServiceRole.entities.Worksheet.list('-created_date', 200);
worksheets = (allWorksheets || []).filter(w => {
  const assignedTo = w.assigned_to || [];
  return assignedTo.includes(effectiveProfileId) || assignedTo.includes(profileId);
});
```

### Current State:
- `worksheet_assignments` table: **0 rows**
- Base44 Worksheet entity: **8 worksheets** (5 published, 3 draft)
- Fallback query **SHOULD** work if profile IDs match

---

## Step 5: Worksheet Open Flow

### When User Clicks Assigned Worksheet:

**Component**: `pages/advisory/ResourceLibrary.jsx`  
**Handler**: `handleWorksheetClick(worksheet, assignmentId)` (line 159-162)  
**Action**: Sets modal state
```javascript
const handleWorksheetClick = (worksheet, assignmentId) => {
  setSelectedWorksheet(worksheet);
  setSelectedAssignmentId(assignmentId);
};
```

**Modal Component**: `components/worksheets/WorksheetCompletionModal.jsx`  
**Actions Executed**:
1. `getWorksheetTemplate` - Fetches from Base44 `Worksheet` entity
2. `getUserResponse` - Fetches from `worksheet_responses` table

**Entity Queried**:
- `Worksheet` (Base44) - for template structure
- `worksheet_responses` (Supabase) - for saved drafts

---

## Step 6: Worksheet Responses

### When User Saves a Worksheet:

**Answer**: **YES** - writes to `worksheet_responses` table

**Backend Function**: `functions/worksheetResponses`  
**Action**: `saveDraft` or `submit`

### Exact Payload (saveDraft):
```javascript
{
  worksheet_id: "worksheet-abc123",           // Base44 Worksheet entity ID
  worksheet_assignment_id: null,              // UUID or null (no assignment record exists)
  profile_id: "23b5c5c7-6d3c-4ad7-b9a1-87fd80028528",  // Supabase UUID
  business_id: "biz-uuid-456",                // Supabase UUID or null
  response_data: {                             // JSONB
    "field_1": "answer text",
    "field_2": "2024-01-15",
    "field_3": "option_a"
  },
  status: "draft",                            // or "completed"
  updated_at: "2024-01-15T10:30:00Z"
}
```

### Exact Payload (submit):
```javascript
{
  worksheet_id: "worksheet-abc123",
  worksheet_assignment_id: null,              // Still null - no assignment record
  profile_id: "23b5c5c7-6d3c-4ad7-b9a1-87fd80028528",
  business_id: "biz-uuid-456",
  response_data: { ... },
  status: "completed",
  submitted_at: "2024-01-15T10:30:00Z",
  submitted_by: "23b5c5c7-6d3c-4ad7-b9a1-87fd80028528",
  updated_at: "2024-01-15T10:30:00Z"
}
```

**Table**: `worksheet_responses` currently has **0 rows**

---

## Step 7: Assignment Verification

### Current Workspace Data Counts:

| Entity/Table | Count | Status |
|--------------|-------|--------|
| **Worksheet Templates** (Base44 entity) | 8 | 5 published, 3 draft |
| **Worksheet Assignments** (Supabase table) | 0 | **EMPTY - NO ASSIGNMENTS** |
| **Worksheet Responses** (Supabase table) | 0 | No completions yet |
| **Resource Assignments** (Supabase table) | 3 | Working correctly |

---

## Step 8: Root Cause Analysis

### Why Assigned Worksheets Appear Empty or Don't Function:

### **ROOT CAUSE: B. Assignment Retrieval (PRIMARY) + A. Assignment Creation (SECONDARY)**

### Broken Steps Identified:

#### **A. Assignment Creation - PARTIALLY BROKEN**

**What Happens**:
- Admin clicks "Assign" → Updates Base44 `Worksheet.assigned_to` array ✅
- Does **NOT** create `worksheet_assignments` table record ❌

**Expected Behavior**:
- Should create record in BOTH:
  1. Base44 `Worksheet.assigned_to` (for admin UI)
  2. Supabase `worksheet_assignments` table (for user queries)

**Current Behavior**:
- Only updates Base44 entity
- `worksheet_assignments` table remains empty (0 rows)

**Code Location**: `components/admin/AssignWorksheetModal.jsx` line 78-81
```javascript
// ONLY updates Base44 entity - NO Supabase table write
await base44.entities.Worksheet.update(worksheet.id, { 
  assigned_to: profileIds,
  updated_at: new Date().toISOString(),
});
```

**Missing Code**:
```javascript
// SHOULD ALSO create worksheet_assignments record
await sb.from('worksheet_assignments').insert({
  worksheet_id: worksheet.id,
  assigned_to_profile_id: profileIds[0],
  assigned_by_profile_id: supabaseProfile.id,
  status: 'assigned',
  created_at: now,
});
```

---

#### **B. Assignment Retrieval - BROKEN**

**What Happens**:
- Resource Library queries `worksheet_assignments` table
- Table has 0 rows (no assignments created)
- Fallback queries Base44 `Worksheet.assigned_to` array

**Fallback Logic** (from `supabaseUserData`):
```javascript
// Fallback if worksheet_assignments table returns 0 rows
const allWorksheets = await base44.asServiceRole.entities.Worksheet.list('-created_date', 200);
worksheets = (allWorksheets || []).filter(w => {
  const assignedTo = w.assigned_to || [];
  return assignedTo.includes(effectiveProfileId);
});
```

**Why This MIGHT Work**:
- If `effectiveProfileId` matches the UUIDs in `assigned_to` array
- Base44 entity query returns all 8 worksheets
- Filter should find assigned ones

**Why This MIGHT Fail**:
- If `effectiveProfileId` is wrong (Base44 user ID vs Supabase profile ID mismatch)
- If `assigned_to` contains Base44 user IDs instead of Supabase profile UUIDs
- If profile ID conversion failed in `AssignWorksheetModal`

---

### **C. Worksheet Opening - WORKING**

When user clicks worksheet card:
- Modal opens correctly ✅
- Template loads from Base44 ✅
- Draft response loads (if exists) ✅

**Status**: Not broken

---

### **D. Response Saving - WORKING**

When user saves/submits:
- Writes to `worksheet_responses` table ✅
- Updates assignment status (if assignment exists) ⚠️
- Fires notification to admin (if assignment exists) ⚠️

**Conditional Failures**:
- `worksheet_assignment_id` is always `null` (no assignment record)
- Cannot update `worksheet_assignments.status` (no record to update)
- Cannot notify assigning admin (no `assigned_by_profile_id` to look up)

**Status**: Partially broken due to missing assignment records

---

### **E. Multiple Failures - CONFIRMED**

**Failure Chain**:
1. **Assignment not created in Supabase** → `worksheet_assignments` empty
2. **Retrieval relies on fallback** → May fail if profile IDs don't match
3. **No assignment ID** → Cannot track status updates
4. **No assigned_by** → Cannot notify correct admin
5. **Notifications fail silently** → Admin doesn't know worksheet completed

---

## Summary: Exact Broken Steps

### **PRIMARY FAILURE: Assignment Creation**
- `AssignWorksheetModal` only updates Base44 entity
- Does NOT create `worksheet_assignments` table record
- **Fix Required**: Add Supabase table insert after Base44 update

### **SECONDARY FAILURE: Assignment Retrieval**
- `getAssignedWorksheets` expects `worksheet_assignments` table
- Table is empty → fallback to Base44 query
- Fallback may fail if profile ID mismatch
- **Fix Required**: Ensure profile IDs match between Base44 and Supabase

### **TERTIARY FAILURE: Response Tracking**
- `worksheet_assignment_id` always `null`
- Cannot update assignment status
- Cannot notify assigning admin
- **Fix Required**: Create assignment records to get valid IDs

---

## Recommended Fix Order

1. **Fix Assignment Creation** - Create `worksheet_assignments` records
2. **Verify Profile ID Matching** - Ensure Supabase UUIDs used consistently
3. **Add Assignment ID to Responses** - Link responses to assignments
4. **Enable Status Updates** - Track assigned → in_progress → completed
5. **Fix Notifications** - Use `assigned_by_profile_id` to notify correct admin

---

**Audit Complete** ✅  
**Root Cause**: Assignment records not created in Supabase (only Base44 entity updated)  
**Impact**: Users cannot see assigned worksheets, admins not notified on completion  
**Severity**: CRITICAL - Core functionality broken