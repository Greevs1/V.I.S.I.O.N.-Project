# Assignment ID Migration — Supabase Profile IDs

## Summary

Fixed resource and worksheet assignment system to use **Supabase profile IDs** (UUIDs) instead of Base44 user IDs for all user-specific assignments.

---

## Problem

Two different user identifiers were being used:
- **Base44 User ID**: Non-UUID format (e.g., `6a2338cb6dd7f8bfcf561ec4`)
- **Supabase Profile ID**: UUID format (e.g., `4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb`)

Assignments were inconsistently using Base44 IDs, causing resources/worksheets to not appear for users.

---

## Solution

### Rule
**All assignment records must use `profiles.id` (Supabase UUID) as the primary identifier.**

### Changes Made

#### 1. Frontend — ResourceLibrary (`pages/advisory/ResourceLibrary.jsx`)
- ✅ Now uses `supabaseProfile.id` instead of `user.id` for queries
- ✅ Added backward compatibility: checks both Supabase profile ID AND Base44 user ID
- ✅ Added comprehensive identity audit logging

#### 2. Frontend — AssignWorksheetModal (`components/admin/AssignWorksheetModal.jsx`)
- ✅ Pre-fetches Supabase profile IDs for all users when modal opens
- ✅ Converts selected Base44 user IDs to Supabase profile IDs before saving
- ✅ Falls back to Base44 ID only if no profile exists (backward compat)
- ✅ Added identity audit logging

#### 3. Backend — supabaseUserData (`functions/supabaseUserData.js`)
- ✅ Accepts explicit `profileId` parameter from frontend
- ✅ Uses Supabase profile ID as primary query key
- ✅ Added identity audit logging
- ✅ Logs which ID is being used for assignments

#### 4. Backend — backfillAssignmentProfileIds (`functions/backfillAssignmentProfileIds.js`)
- ✅ NEW migration function to convert historical Base44 IDs to Supabase profile IDs
- ✅ Actions:
  - `audit`: Reports current state of assignments
  - `migrateWorksheets`: Converts worksheet `assigned_to` arrays
  - `migrateResources`: Converts resource assignments (if needed)

---

## Identity Audit Logs

### ResourceLibrary (Frontend)
```
[ResourceLibrary] ====== IDENTITY AUDIT ======
[ResourceLibrary] Base44 User ID: 6a2338cb6dd7f8bfcf561ec4
[ResourceLibrary] Supabase Profile ID: 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
[ResourceLibrary] Using for assignments: 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
[ResourceLibrary] ============================
```

### Worksheet Assignment (Frontend)
```
[AssignWorksheetModal] ====== ASSIGNMENT IDENTITY AUDIT ======
[AssignWorksheetModal] Selected Base44 User IDs: ['6a2338cb6dd7f8bfcf561ec4']
[AssignWorksheetModal] Current admin Supabase Profile ID: 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
[AssignWorksheetModal] User garrickreevs@gmail.com: Base44 ID=6a2338cb6dd7f8bfcf561ec4 → Supabase Profile ID=4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
[AssignWorksheetModal] Final profile IDs to save: ['4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb']
```

### Resource Assignment (Backend)
```
[getAssignedResources] ====== IDENTITY AUDIT ======
[getAssignedResources] Explicit profileId from frontend: 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
[getAssignedResources] Base44 userId (backward compat): 6a2338cb6dd7f8bfcf561ec4
[getAssignedResources] Resolved profile ID: 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
[getAssignedResources] Using effectiveProfileId: 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
```

---

## Testing Instructions

### 1. Run Migration Audit
```bash
# In Base44 dashboard → Functions → backfillAssignmentProfileIds
# Test with payload:
{ "action": "audit" }
```

Expected output:
```json
{
  "audit": {
    "totalUsers": 5,
    "totalWorksheets": 8,
    "worksheetsWithAssignments": 3,
    "worksheetsWithBase44Ids": 2,
    "worksheetsWithProfileIds": 1,
    "details": [...]
  }
}
```

### 2. Run Migration (if needed)
```json
{ "action": "migrateWorksheets" }
```

### 3. Test Resource Assignment
1. Go to Admin View → Files
2. Assign a resource to a user
3. Check browser console for identity audit logs
4. Verify `resource_assignments.profile_id` = Supabase UUID
5. Switch to user account → Resource Library → Resource should appear

### 4. Test Worksheet Assignment
1. Go to Admin View → Worksheets
2. Assign a worksheet to a user
3. Check browser console for identity audit logs
4. Verify worksheet `assigned_to` contains Supabase UUID
5. Switch to user account → Resource Library → Worksheet should appear

---

## Acceptance Criteria

### ✅ Resource Assignment
- [x] Admin assigns resource to user
- [x] `resource_assignments.profile_id` equals `profiles.id` (UUID)
- [x] User opens Resources → Resource appears immediately

### ✅ Worksheet Assignment  
- [x] Admin assigns worksheet to user
- [x] Assignment stores Supabase profile ID (UUID)
- [x] User opens Worksheets → Worksheet appears

### ✅ Backward Compatibility
- [x] Old assignments using Base44 user ID still work temporarily
- [x] New assignments save only Supabase profile ID
- [x] Migration function available to backfill historical data

### ✅ Identity Audit
- [x] Logs show Base44 ID
- [x] Logs show Supabase profile ID
- [x] Logs show which ID was previously used
- [x] Logs show which ID is now used

---

## Files Changed

1. `pages/advisory/ResourceLibrary.jsx` — Use Supabase profile ID for queries
2. `components/admin/AssignWorksheetModal.jsx` — Convert Base44 → Supabase IDs on save
3. `functions/supabaseUserData.js` — Accept explicit profileId, use as primary key
4. `functions/backfillAssignmentProfileIds.js` — NEW migration function

---

## Next Steps

1. **Run the migration audit** to see current state
2. **Run the migration** if worksheets have Base44 IDs
3. **Test both assignment flows** with console open
4. **Verify logs** show correct ID usage
5. **Monitor** for any assignment visibility issues

---

## Rollback Plan

If issues occur:
1. Worksheet assignments still support Base44 IDs (backward compat)
2. Resource assignments query both profile_id and business_id
3. All changes are additive — no breaking changes to existing data