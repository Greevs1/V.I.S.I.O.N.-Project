# WORKSHEET ASSIGNMENT FIX - MIGRATION REQUIRED

## Problem

The `worksheet_assignments` table exists but is **EMPTY** - no rows are being inserted when admins assign worksheets.

**Root Cause**: The `AssignWorksheetModal` component was only updating the Base44 `Worksheet.assigned_to` array but **never calling the `assignWorksheetToUser` backend function** to create Supabase records.

## Fix Applied

### 1. Updated AssignWorksheetModal ✅
- Now calls `assignWorksheetToUser` backend function
- Passes all required fields: worksheet_id, target_email, due_date, scheduled_for, reminder_settings, status
- Uses Supabase profile IDs (not Base44 user IDs)

### 2. Backend Function Exists ✅
- `functions/assignWorksheetToUser` already creates `worksheet_assignments` records
- Validates worksheet exists in Base44
- Looks up target profile by email in Supabase
- Inserts record with all scheduling/reminder fields

### 3. Database Schema Issue ⚠️

The `worksheet_assignments` table exists but may be missing required columns.

**ACTION REQUIRED**: Run this SQL migration in Supabase SQL Editor:

```sql
-- Step 1: Drop existing table if it has wrong schema
DROP TABLE IF EXISTS worksheet_assignments CASCADE;

-- Step 2: Recreate with correct schema
CREATE TABLE worksheet_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id TEXT NOT NULL,
  assigned_to_profile_id UUID NOT NULL REFERENCES profiles(id),
  assigned_to_business_id UUID REFERENCES businesses(id),
  assigned_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  due_date TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  reminder_settings JSONB DEFAULT '{"type": "none", "method": "in_app", "enabled": false}',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create performance indexes
CREATE INDEX idx_wa_profile ON worksheet_assignments(assigned_to_profile_id);
CREATE INDEX idx_wa_business ON worksheet_assignments(assigned_to_business_id);
CREATE INDEX idx_wa_worksheet ON worksheet_assignments(worksheet_id);
CREATE INDEX idx_wa_status ON worksheet_assignments(status);
CREATE INDEX idx_wa_scheduled ON worksheet_assignments(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_wa_profile_status ON worksheet_assignments(assigned_to_profile_id, status);
CREATE INDEX idx_wa_profile_created ON worksheet_assignments(assigned_to_profile_id, created_at DESC);

-- Step 4: Verify table exists
SELECT COUNT(*) FROM worksheet_assignments;
```

## Acceptance Test

After running migration:

1. **Admin assigns worksheet**:
   - Go to Worksheet Editor
   - Click "Assign" button
   - Select user (e.g., garrickreevs@gmail.com)
   - Set due date
   - Click "Save & Assign"

2. **Verify record created**:
   ```sql
   SELECT * FROM worksheet_assignments 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```
   
   **Expected**: At least one row with:
   - `worksheet_id` = Base44 worksheet ID
   - `assigned_to_profile_id` = user's Supabase UUID
   - `assigned_by_profile_id` = admin's Supabase UUID
   - `status` = 'assigned' or 'scheduled'
   - `due_date` = timestamp
   - `created_at` = recent timestamp

3. **User sees assignment**:
   - User opens Resource Library
   - Worksheet appears under "Assigned" tab
   - Card shows due date, status badge

4. **User completes worksheet**:
   - Opens assigned worksheet
   - Fills out fields
   - Clicks "Submit"
   - Assignment moves to "Completed" tab

5. **Admin views completion**:
   - Opens admin user profile
   - Worksheets tab shows completed items
   - Can view submitted responses

## Diagnostic Queries

```sql
-- Check table exists and has correct columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'worksheet_assignments'
ORDER BY ordinal_position;

-- Check for assignments
SELECT 
  wa.id,
  wa.worksheet_id,
  wa.assigned_to_profile_id,
  p.email as assigned_to_email,
  wa.assigned_by_profile_id,
  ap.email as assigned_by_email,
  wa.status,
  wa.due_date,
  wa.scheduled_for,
  wa.created_at
FROM worksheet_assignments wa
LEFT JOIN profiles p ON p.id = wa.assigned_to_profile_id
LEFT JOIN profiles ap ON ap.id = wa.assigned_by_profile_id
ORDER BY wa.created_at DESC
LIMIT 20;

-- Check for profile IDs
SELECT id, email, created_at 
FROM profiles 
WHERE email IN ('garrickreevs@gmail.com', 'reevs@mycapitalimpact.com');
```

## Files Modified

1. `components/admin/AssignWorksheetModal` - Added scheduling UI + backend function call
2. `functions/assignWorksheetToUser` - Already exists, creates Supabase records
3. `supabase/migrations/01_create_worksheet_assignments.sql` - Migration SQL
4. `functions/debugWorksheetAssignments` - Diagnostic function
5. `functions/testWorksheetAssignmentFlow` - Test function

## Next Steps

1. **Run SQL migration** in Supabase SQL Editor
2. **Test assignment** from Worksheet Editor
3. **Verify record** appears in `worksheet_assignments` table
4. **Test user view** in Resource Library
5. **Test completion flow**