# Assigned Resources & Worksheets - Emergency Fix Summary

## ✅ What Was Fixed

### 1. Identity System
- **Source of Truth**: Now using `profiles.id` (Supabase UUID) for all assignment matching
- **Fallback Support**: Still supports Base44 user ID for backward compatibility during transition
- **Audit Logging**: Added comprehensive console logging to track identity resolution

### 2. Resource Library (`/advisory/resources`)

#### Assigned Resources
- **Primary Method**: Queries `resource_assignments` table first
- **Fallback Method**: Checks for legacy pointer documents in `documents` table
- **Performance**: Added timing metrics - target <1 second
- **Caching**: Reduced stale time to 5 seconds for faster updates
- **Refetch**: Now refetches on mount AND window focus

#### Assigned Worksheets  
- **New Action**: `getAssignedWorksheets` in supabaseUserData backend
- **Primary Method**: Queries `worksheet_assignments` table
- **Fallback Method**: Checks Worksheet entity `assigned_to` array
- **Performance**: Added timing metrics - target <1 second
- **Independent Loading**: Resources and worksheets load independently

### 3. Admin User Worksheets Tab

#### New Backend Action
- `getAdminAssignedWorksheetsForUser` in supabaseUserData
- Uses **selected user's profile ID**, NOT admin's profile ID
- Accepts `selected_profile_id` and `selected_business_id` parameters
- Returns worksheets assigned to the specific selected user

#### Frontend Integration
- AdminUserProfileContext now calls the new action
- Passes `selectedProfileId` from target user's profile
- Added performance timing and debug logging

### 4. Performance Optimizations

#### Query Improvements
- Parallel data fetching where possible
- Reduced stale cache time: 30s → 5s
- Refetch on window focus enabled
- Performance timing on all queries
- Early returns when profile ID missing

#### Backend Optimizations
- Direct Supabase queries instead of sequential Base44 entity scans
- OR filters for profile/business matching
- Indexed lookups on assignment tables
- Duration logging for monitoring

## 🔍 Diagnostic Tools

### Backend Function: `diagnosticAssignments`

Call this to get a complete audit:

```javascript
const res = await base44.functions.invoke('diagnosticAssignments', {
  target_user_email: 'user@example.com', // optional - defaults to current user
});
console.log(res.data);
```

Returns:
- Base44 user ID vs Supabase profile ID
- Resource assignments (table + pointer docs)
- Worksheet assignments (table + entity array)
- Diagnosis and recommendations

### Console Logging

Check browser console for:
```
[ResourceLibrary] ✓ Assigned Resources: X items in Y ms
[ResourceLibrary] ✓ Assigned Worksheets: X items in Y ms
[AdminUserProfileContext] Admin worksheets loaded in X ms | Count: Y
```

## 🧪 Acceptance Testing

### Test 1: User Resource Library
1. Assign a resource to a user via Admin Files
2. Log in as that user
3. Go to `/advisory/resources`
4. **Expected**: Resource appears under "Assigned Resources"
5. **Expected**: "Assigned Worksheets" section still visible (even if empty)
6. **Expected**: Load time < 1 second

### Test 2: Assigned Worksheets
1. Assign a worksheet to a user via Admin Worksheets
2. Log in as that user  
3. Go to `/advisory/resources`
4. **Expected**: Worksheet appears under "Assigned Worksheets"
5. **Expected**: Load time < 1 second

### Test 3: Admin User Worksheets Tab
1. Log in as admin
2. Go to Admin → Users & Clients → Select User → Worksheets tab
3. **Expected**: Shows worksheets assigned to THAT user (not admin)
4. **Expected**: Uses selected user's `profiles.id` for query
5. **Expected**: Load time < 1 second

### Test 4: Identity Audit
1. Open browser console
2. Navigate to Resource Library
3. **Expected**: See identity audit logs showing:
   - Base44 User ID
   - Supabase Profile ID
   - Match result (should differ - that's correct)

## 📊 Performance Targets

| Query | Target | Measurement |
|-------|--------|-------------|
| getAssignedResources | < 1000ms | Console timing |
| getAssignedWorksheets | < 1000ms | Console timing |
| getAdminAssignedWorksheetsForUser | < 1000ms | Console timing |

## 🔧 Troubleshooting

### Resources Not Showing
1. Check console for `[getAssignedResources]` logs
2. Verify `profiles.id` exists for the user
3. Run `diagnosticAssignments` to see assignment state
4. Check if using `resource_assignments` table or pointer docs

### Worksheets Not Showing
1. Check console for `[getAssignedWorksheets]` logs
2. Verify worksheet status is `published`
3. Verify `assigned_to` contains Supabase profile ID
4. Run `diagnosticAssignments` for full audit

### Admin Tab Shows Wrong User's Worksheets
1. Verify `selectedProfileId` is being passed correctly
2. Check console for `[getAdminAssignedWorksheetsForUser]` logs
3. Confirm it's using target user's profile ID, not admin's

## 📝 Database Schema Notes

### resource_assignments (preferred)
```sql
- id
- resource_document_id
- assigned_to_profile_id (UUID - profiles.id)
- assigned_to_business_id
- assigned_by_profile_id
- created_at
```

### worksheet_assignments (preferred)
```sql
- id
- worksheet_id
- assigned_to_profile_id (UUID - profiles.id)
- assigned_to_business_id
- assigned_by_profile_id
- status
- due_date
- created_at
```

### Worksheet Entity (legacy fallback)
```json
{
  "id": "...",
  "assigned_to": ["profile-uuid-1", "profile-uuid-2"],
  "status": "published"
}
```

## 🎯 Next Steps

1. **Test All Scenarios**: Run through acceptance tests above
2. **Monitor Console**: Check for timing and error logs
3. **Run Diagnostics**: Use `diagnosticAssignments` if issues persist
4. **Report Results**: Share console output and timing metrics

## ⚠️ Known Limitations

- Historical assignments using Base44 IDs may not show until migrated
- Worksheet entity `assigned_to` array is a fallback, not primary method
- Resource assignments require either table or pointer docs to exist

## 🚀 Migration Path

For historical data using Base44 user IDs:

1. Run `backfillAssignmentProfileIds` backend function
2. Converts Base44 IDs → Supabase UUIDs
3. Updates Worksheet `assigned_to` arrays
4. Audit report shows conversion status

---

**Status**: ✅ Deployed
**Date**: 2026-06-19
**Performance**: All queries targeting <1 second
**Identity**: Supabase profile ID as primary key