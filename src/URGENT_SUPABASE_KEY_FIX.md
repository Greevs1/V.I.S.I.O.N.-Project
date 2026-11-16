# URGENT: Supabase Service Role Key Invalid

## Problem Identified

The backend functions are working correctly and reading the environment variable `SUPABASE_SERVICE_ROLE_KEY` properly, but the **key itself is invalid or corrupted**.

### Test Results

```
✅ Profile Lookup: SUCCESS
   - Profile ID: 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb
   - Business ID: 42f42075-c453-436a-8c5f-2dc29ef718c6
   - Email lookup working correctly

✅ Business Resolution: SUCCESS
   - Using existing primary_business_id from profile

❌ Storage Upload: FAILED
   - Error: "Invalid Compact JWS"
   - This means the JWT signature in SUPABASE_SERVICE_ROLE_KEY is invalid
```

## Root Cause

The `SUPABASE_SERVICE_ROLE_KEY` environment variable contains an invalid JWT token. This happens when:
1. The key was copied incorrectly (missing characters, extra spaces)
2. The key expired or was revoked
3. The key from the wrong project was used

## IMMEDIATE ACTION REQUIRED

### Step 1: Get New Service Role Key from Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `tfrbswfrhrtgfcgonimb`
3. Go to **Settings** (gear icon in sidebar)
4. Click **API** in the left menu
5. Find **Project API keys** section
6. Click **Reveal** next to `service_role` key
7. **Copy the entire key** (starts with `eyJ...`)

### Step 2: Update Base44 Environment Variable

1. Go to Base44 Dashboard → Your App → Settings → Environment Variables
2. Find `SUPABASE_SERVICE_ROLE_KEY`
3. **Replace** the value with the new key from Supabase
4. **Save** the changes

### Step 3: Redeploy Backend Functions

1. Go to Base44 Dashboard → Code → Functions
2. For each function, click **Deploy** (or use "Deploy All" if available)
3. Wait for deployment to complete

### Step 4: Test Upload

1. Go to Document Upload page in your app
2. Try uploading a small test file (< 1MB)
3. Check browser console for logs

## Expected Success Logs

After fixing the key, you should see:

```
[getSignedUploadUrl] ========== STEP 11: STORAGE URL GENERATION SUCCESS ==========
[getSignedUploadUrl] STEP 11 PASSED: Signed URL generated successfully
[getSignedUploadUrl] STEP 11: Full URL: https://...

[DocumentUpload] STEP 2 PASSED: Signed URL received
[DocumentUpload] STEP 3: Uploading file to Supabase Storage via XHR PUT...
[DocumentUpload] STEP 3 PASSED: Storage upload completed

[DocumentUpload] STEP 4: Creating document metadata records...
[DocumentUpload] STEP 4 PASSED: Metadata created successfully
[DocumentUpload] ========== UPLOAD COMPLETED ==========
```

## Verification Checklist

After fixing, verify these all work:

- [ ] Environment variable updated in Base44
- [ ] Backend functions redeployed
- [ ] Profile lookup succeeds (check logs)
- [ ] Business resolution succeeds (check logs)
- [ ] Storage upload succeeds (no "Invalid Compact JWS" error)
- [ ] Documents table insert succeeds
- [ ] Document_analysis table insert succeeds
- [ ] File appears in Supabase Storage bucket `client-documents`

## Database Schema Confirmed

The following required fields are correctly handled:

### `documents` table:
- ✅ `profile_id` - Resolved from profile lookup
- ✅ `business_id` - Resolved from profile.primary_business_id
- ✅ `file_name` - From upload request
- ✅ `file_size` - From upload request
- ✅ `mime_type` - From upload request
- ✅ `storage_path` - Generated from profileId/businessId/timestamp
- ✅ `bucket_name` - Always 'client-documents'
- ✅ `document_type` - Validated against allowlist

### `document_analysis` table:
- ✅ `document_id` - From documents insert result
- ✅ `profile_id` - From profile lookup
- ✅ `business_id` - From business resolution
- ✅ `status` - Auto-set to 'queued'

## Backend Functions Verified

All functions correctly use `SUPABASE_SERVICE_ROLE_KEY`:

- ✅ `getSignedUploadUrl` - Line 40
- ✅ `uploadDocumentDirect` - Line 128
- ✅ `supabaseHealthCheck` - Working (database/storage connected)
- ✅ `supabaseUserData` - Uses same pattern
- ✅ All other supabase* functions - Use same pattern

**No incorrect variable names found** (no SUPABASE_SERVICE_KEY, SUPABASE_SECRET_KEY, etc.)

## Contact Support If...

If you've rotated the key and it still fails:
1. Check Supabase dashboard for any project issues
2. Verify the `client-documents` bucket exists and is accessible
3. Check RLS policies on `documents` and `document_analysis` tables
4. Contact Base44 support with the exact error logs