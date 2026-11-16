# Document Upload Debug - Profile/Business Lookup Fix

## Changes Made

### 1. Backend Functions Updated

#### `getSignedUploadUrl` Function:
- ✅ **Logs current authenticated user object** with full JSON
- ✅ **Logs profile lookup query** (table, filter)
- ✅ **Enhanced error logging** with full error objects (code, hint, details, stack)
- ✅ **Returns clear error** if no profile found: "No Supabase profile found for current user"
- ✅ **Blocks upload** if business_id is missing: "Please select a business before uploading documents."
- ✅ **Does not assume auth_user_id exists** - only queries by email
- ✅ **Auto-creates business_entities** record if none exists (fallback behavior)

#### `uploadDocumentDirect` Function:
- ✅ **Wrapped documents insert** in try/catch with full error logging
- ✅ **Wrapped document_analysis insert** in try/catch with full error logging
- ✅ **Returns detailed errors** including code, hint, details, stack
- ✅ **Rollback logic** if document_analysis insert fails

### 2. Frontend Updated

#### `DocumentUpload` Page:
- ✅ **Enhanced error parsing** from backend responses
- ✅ **User-friendly error messages** based on error step:
  - Profile errors → "Profile Error: No Supabase profile found..."
  - Business errors → "Business Required: Please select a business..."
  - Storage errors → "Storage Error: [details] (Code: [code])"
  - Database insert errors → "Database Error: [details] (Code: [code])"
- ✅ **Logs full error objects** to console for debugging

## Database Schema Requirements

Based on the code, the following fields are **REQUIRED** for document uploads:

### `documents` table:
- ✅ `profile_id` - **REQUIRED** (foreign key to profiles)
- ✅ `business_id` - **REQUIRED** (foreign key to business_entities)
- ✅ `file_name` - **REQUIRED**
- ✅ `file_size` - **REQUIRED**
- ✅ `mime_type` - **REQUIRED**
- ✅ `storage_path` - **REQUIRED**
- ✅ `bucket_name` - **REQUIRED** (always 'client-documents')
- ✅ `document_type` - **REQUIRED**
- `year` - optional (nullable)
- `upload_status` - auto-set to 'pending_analysis'

### `document_analysis` table:
- ✅ `document_id` - **REQUIRED** (foreign key to documents)
- ✅ `profile_id` - **REQUIRED** (foreign key to profiles)
- ✅ `business_id` - **REQUIRED** (foreign key to business_entities)
- `status` - auto-set to 'queued'

## Critical Issues to Check

### 1. **Environment Variable Typo**
⚠️ **Current secret name**: `SUPABAS_SERVICE_ROLE_KEY` (MISSING 'E')
✅ **Should be**: `SUPABASE_SERVICE_ROLE_KEY`

**Action Required:**
1. Go to Base44 Dashboard → Settings → Environment Variables
2. Find `SUPABAS_SERVICE_ROLE_KEY`
3. Rename it to `SUPABASE_SERVICE_ROLE_KEY` (add the 'E')
4. Redeploy all backend functions

### 2. **Profile Lookup**
The functions now query profiles by **email only** (not auth_user_id):
```javascript
.from('profiles')
.select('id, app_role, primary_business_id, auth_user_id, ghl_contact_id')
.eq('email', user.email)
.maybeSingle()
```

**If profiles have NULL auth_user_id**, that's OK - the lookup will still work by email.

### 3. **Business Resolution Flow**
The backend now follows this logic:
1. Check `profile.primary_business_id`
2. If NULL, search `business_entities` for existing records with `profile_id`
3. If found, use that business_id
4. If NOT found, **return error**: "Please select a business before uploading documents."

**This means users MUST have a business selected before uploading.**

## Testing Checklist

### Before Upload:
- [ ] User is authenticated (Base44 auth)
- [ ] User has a Supabase profile (profiles table, matched by email)
- [ ] User has a business_entities record OR primary_business_id set
- [ ] Environment variable `SUPABASE_SERVICE_ROLE_KEY` is set correctly (with 'E')

### During Upload:
- [ ] Check browser console for detailed logs
- [ ] Look for "STEP 8: PROFILE LOOKUP" logs
- [ ] Look for "STEP 9: BUSINESS RESOLUTION" logs
- [ ] Verify profile_id and business_id are resolved

### If Upload Fails:
- [ ] Check error message in UI (should be specific, not generic 500)
- [ ] Check browser console for full error object
- [ ] Look for error step: `profile_fetch`, `business_fetch`, `storage_url_generation`, `documents_insert`, `document_analysis_insert`
- [ ] Check error code, hint, details from backend response

## Next Steps

1. **Fix environment variable name** (add 'E' to SUPABASE_SERVICE_ROLE_KEY)
2. **Redeploy backend functions** (go to Code → Functions → Deploy)
3. **Test upload** with a small file (< 1MB)
4. **Check console logs** for profile/business resolution
5. **If still failing**, share the exact error message and console logs

## Expected Console Output (Success)

```
[getSignedUploadUrl] ========== STEP 8: PROFILE LOOKUP START ==========
[getSignedUploadUrl] STEP 8: Current authenticated user: {"email": "user@example.com", "id": "..."}
[getSignedUploadUrl] STEP 8: Profile lookup query - Table: profiles, Filter: email = user@example.com
[getSignedUploadUrl] ========== STEP 8: PROFILE LOOKUP PASSED ==========
[getSignedUploadUrl] STEP 8 PASSED: Profile found: {"profileId": "...", "primary_business_id": "..."}
[getSignedUploadUrl] ========== STEP 9: BUSINESS RESOLUTION START ==========
[getSignedUploadUrl] STEP 9 PASSED: Using existing primary_business_id: "..."
[getSignedUploadUrl] ========== SUCCESS ==========
```

## Expected Console Output (Failure - No Business)

```
[getSignedUploadUrl] ========== STEP 9: NO BUSINESS FOUND ==========
[getSignedUploadUrl] STEP 9 FAILED: No business_entities found for profile_id: ...
[getSignedUploadUrl] STEP 9 FAILED: User must select a business before uploading documents
```

**UI will show**: "Business Required: Please select a business before uploading documents."