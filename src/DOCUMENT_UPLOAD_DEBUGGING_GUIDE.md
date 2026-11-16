# DOCUMENT UPLOAD DEBUGGING GUIDE

**Date:** 2026-06-12  
**Status:** Enhanced Error Logging Enabled

---

## 🔍 HOW TO DEBUG UPLOAD FAILURES

### Step 1: Open Browser Console
1. Navigate to `/upload` page
2. Open browser DevTools (F12 or Cmd+Option+I)
3. Go to **Console** tab
4. Clear console
5. Attempt file upload

### Step 2: Check Backend Function Logs
1. Go to **Dashboard → Code → Functions**
2. Select `getSignedUploadUrl` or `uploadDocumentDirect`
3. Click **Logs** tab
4. Look for timestamps matching your upload attempt

---

## 📊 ENHANCED LOG STRUCTURE

### Backend Function: `getSignedUploadUrl`

**Success Flow Logs:**
```
[getSignedUploadUrl] ========== STEP 1: REQUEST RECEIVED ==========
[getSignedUploadUrl] STEP 2: Authenticating user...
[getSignedUploadUrl] STEP 2 PASSED: User authenticated: user@example.com
[getSignedUploadUrl] STEP 3: Loading Supabase configuration...
[getSignedUploadUrl] STEP 3 PASSED: Supabase configuration loaded
[getSignedUploadUrl] STEP 4: Initializing Supabase client...
[getSignedUploadUrl] STEP 5: Parsing request body...
[getSignedUploadUrl] STEP 5 PASSED: Body parsed: { fileName: "test.pdf", fileType: "application/pdf", fileSize: "5.23MB" }
[getSignedUploadUrl] STEP 6: Validating required fields...
[getSignedUploadUrl] STEP 6 PASSED: All required fields present
[getSignedUploadUrl] STEP 7: Validating file size...
[getSignedUploadUrl] STEP 7 PASSED: File size valid
[getSignedUploadUrl] STEP 8: Resolving user profile...
[getSignedUploadUrl] STEP 8 PASSED: Profile found: { profileId: "abc-123", role: "owner" }
[getSignedUploadUrl] STEP 9: Resolving business_id...
[getSignedUploadUrl] STEP 9 PASSED: Using existing primary_business_id: xyz-789
[getSignedUploadUrl] STEP 10: Generating storage path...
[getSignedUploadUrl] STEP 10 PASSED: Storage path generated: profile-id/business-id/timestamp_test.pdf
[getSignedUploadUrl] STEP 11: Generating signed upload URL for bucket: client-documents
[getSignedUploadUrl] STEP 11 PASSED: Signed URL generated successfully
[getSignedUploadUrl] ========== SUCCESS ==========
[getSignedUploadUrl] Total duration: 234ms
```

**Failure Example (Profile Not Found):**
```
[getSignedUploadUrl] STEP 2: Authenticating user...
[getSignedUploadUrl] STEP 2 PASSED: User authenticated: user@example.com
[getSignedUploadUrl] STEP 8: Resolving user profile...
[getSignedUploadUrl] STEP 8 FAILED: Profile not found for email: user@example.com
→ Returns: 404 Profile not found
```

**Failure Example (Storage Bucket Error):**
```
[getSignedUploadUrl] STEP 11: Generating signed upload URL for bucket: client-documents
[getSignedUploadUrl] STEP 11 FAILED: Storage URL generation error: Bucket not found
→ Returns: 500 Storage error: Failed to generate upload URL for bucket 'client-documents' - Bucket not found
```

---

### Backend Function: `uploadDocumentDirect`

**Success Flow Logs:**
```
========== uploadDocumentDirect STARTED ==========
[uploadDocumentDirect] STEP 1: Authenticating user...
[uploadDocumentDirect] STEP 1 PASSED: User authenticated: user@example.com
[uploadDocumentDirect] STEP 2: Parsing request body...
[uploadDocumentDirect] STEP 2 PASSED: Body parsed
[uploadDocumentDirect] STEP 3: Validating required fields...
[uploadDocumentDirect] STEP 3 PASSED: All required fields present and valid
[uploadDocumentDirect] STEP 4: Validating file size...
[uploadDocumentDirect] STEP 4 PASSED: File size valid
[uploadDocumentDirect] STEP 5: Initializing Supabase client...
[uploadDocumentDirect] STEP 5 PASSED: Supabase client initialized
[uploadDocumentDirect] STEP 6: Resolving user profile...
[uploadDocumentDirect] STEP 6 PASSED: Profile found: { profileId: "abc-123", role: "owner" }
[uploadDocumentDirect] STEP 7: Resolving business_id...
[uploadDocumentDirect] STEP 7 PASSED: Using existing primary_business_id: xyz-789
[uploadDocumentDirect] STEP 8: Inserting into documents table...
[uploadDocumentDirect] STEP 8 PASSED: Document created: doc-id-123
[uploadDocumentDirect] STEP 9: Inserting into document_analysis table...
[uploadDocumentDirect] STEP 9 PASSED: document_analysis created: analysis-id-456
========== uploadDocumentDirect COMPLETED ==========
Total duration: 456ms
```

**Failure Example (Documents Insert Failed):**
```
[uploadDocumentDirect] STEP 8: Inserting into documents table...
[uploadDocumentDirect] STEP 8 FAILED: Document insert error: new row violates row-level security policy
Error details: {
  message: "new row violates row-level security policy for table \"documents\"",
  code: "42P01",
  details: "Failing row contains (profile-id, business-id, ...)"
}
→ Returns: 500 Database error: Failed to insert into documents - new row violates row-level security policy
```

**Failure Example (Missing Fields):**
```
[uploadDocumentDirect] STEP 3: Validating required fields...
[uploadDocumentDirect] STEP 3 FAILED: Missing required fields: ["storagePath"]
→ Returns: 400 Validation failed: Missing required fields: storagePath
```

---

## 🎯 COMMON ERRORS & SOLUTIONS

### Error 1: "Profile not found"
**Symptom:** 404 error  
**Cause:** User email doesn't exist in `profiles` table  
**Solution:**
```sql
-- Check if profile exists
SELECT * FROM profiles WHERE email = 'user@example.com';

-- If missing, create it
INSERT INTO profiles (email, app_role, created_at)
VALUES ('user@example.com', 'owner', NOW());
```

### Error 2: "Bucket not found" or "Storage error"
**Symptom:** 500 error from `getSignedUploadUrl`  
**Cause:** `client-documents` bucket doesn't exist  
**Solution:**
1. Go to Supabase Dashboard → Storage
2. Create bucket named `client-documents`
3. Set bucket to **Private**
4. Verify bucket name matches exactly (case-sensitive)

### Error 3: "violates row-level security policy"
**Symptom:** 500 error from `uploadDocumentDirect`  
**Cause:** RLS policy blocking insert  
**Solution:**
```sql
-- Check current RLS policies
SELECT * FROM pg_policies WHERE tablename = 'documents';

-- Temporarily disable RLS for testing
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;

-- Or create permissive policy
DROP POLICY IF EXISTS "Users can insert documents" ON documents;
CREATE POLICY "Users can insert documents"
ON documents FOR INSERT
WITH CHECK (
  auth.uid()::text = profile_id OR
  auth.jwt()->>'role' IN ('admin', 'super_admin')
);
```

### Error 4: "No business found"
**Symptom:** 400 error from `uploadDocumentDirect`  
**Cause:** User has no `business_entities` record  
**Solution:**
```sql
-- Check for existing businesses
SELECT * FROM business_entities WHERE profile_id = 'profile-id';

-- Create business if missing
INSERT INTO business_entities (profile_id, business_name, current_stage, created_at)
VALUES ('profile-id', 'My Business', 'onboarding', NOW())
RETURNING id;

-- Update profile with business_id
UPDATE profiles SET primary_business_id = 'business-id' WHERE id = 'profile-id';
```

### Error 5: "File size exceeds limit"
**Symptom:** 400 error  
**Cause:** File larger than 25MB  
**Solution:**
- Frontend validation should catch this before upload
- Check `MAX_FILE_SIZE` constant in both frontend and backend
- Compress file or split into smaller files

### Error 6: "Supabase not configured"
**Symptom:** 500 error immediately  
**Cause:** Missing environment variables  
**Solution:**
1. Go to Dashboard → Settings → Environment Variables
2. Verify these exist:
   - `VITE_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Restart function if needed

---

## 📋 PRE-FLIGHT CHECKLIST

Before uploading, verify:

- [ ] User is authenticated (logged in)
- [ ] User has a profile in `profiles` table
- [ ] User has a business in `business_entities` table
- [ ] `client-documents` bucket exists in Supabase Storage
- [ ] Bucket is set to **Private**
- [ ] RLS policies allow inserts (or RLS is disabled for testing)
- [ ] Environment variables are set:
  - `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] File size ≤ 25MB
- [ ] File count ≤ 10 per batch
- [ ] Total batch size ≤ 150MB

---

## 🔬 STEP-BY-STEP DEBUGGING WORKFLOW

### Scenario: Upload Fails with 500 Error

**Step 1: Identify Which Function Failed**
- Check browser console for error message
- Look for function name in error:
  - `getSignedUploadUrl` → Storage URL generation failed
  - `uploadDocumentDirect` → Database insert failed

**Step 2: Check Backend Logs**
```
Dashboard → Code → Functions → [Function Name] → Logs
```
- Find logs matching upload timestamp
- Look for "FAILED" messages
- Note the step number where it failed

**Step 3: Analyze Error Details**
- Error type (400, 401, 404, 500)
- Error message (specific description)
- Error details (database error, storage error, etc.)
- Step number (1-11 for getSignedUploadUrl, 1-9 for uploadDocumentDirect)

**Step 4: Check Database State**
```sql
-- Check profile exists
SELECT id, email, app_role, primary_business_id 
FROM profiles 
WHERE email = 'user@example.com';

-- Check business exists
SELECT id, business_name, current_stage 
FROM business_entities 
WHERE profile_id = 'profile-id';

-- Check documents table structure
\d documents

-- Check document_analysis table structure
\d document_analysis
```

**Step 5: Check Storage Bucket**
```
Supabase Dashboard → Storage → client-documents
```
- Bucket exists?
- Bucket is Private (not Public)?
- No bucket-level size restrictions?

**Step 6: Check RLS Policies**
```sql
-- Documents table RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'documents';

-- Document analysis table RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'document_analysis';

-- Storage objects RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';
```

**Step 7: Test with Small File**
- Try uploading a 1MB PDF file
- If it works, issue is size-related
- If it fails, issue is configuration-related

**Step 8: Enable Verbose Logging**
- Already enabled by default
- Check browser console for detailed frontend logs
- Check backend function logs for detailed step-by-step

---

## 🛠️ QUICK FIX COMMANDS

### Reset User Profile
```sql
-- Delete and recreate profile
DELETE FROM profiles WHERE email = 'user@example.com';

INSERT INTO profiles (email, app_role, created_at, updated_at)
VALUES ('user@example.com', 'owner', NOW(), NOW());
```

### Reset Business
```sql
-- Delete business and update profile
DELETE FROM business_entities WHERE profile_id = 'profile-id';

UPDATE profiles SET primary_business_id = NULL WHERE id = 'profile-id';

-- Recreate business
INSERT INTO business_entities (profile_id, business_name, current_stage, created_at, updated_at)
VALUES ('profile-id', 'My Business', 'onboarding', NOW(), NOW())
RETURNING id;
```

### Disable RLS Temporarily (Testing Only)
```sql
-- Disable RLS on documents
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;

-- Disable RLS on document_analysis
ALTER TABLE document_analysis DISABLE ROW LEVEL SECURITY;

-- Re-enable after testing
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_analysis ENABLE ROW LEVEL SECURITY;
```

### Create Permissive RLS Policies
```sql
-- Documents: Allow insert by profile owner
DROP POLICY IF EXISTS "Users can insert documents" ON documents;
CREATE POLICY "Users can insert documents"
ON documents FOR INSERT
WITH CHECK (
  auth.uid()::text = profile_id OR
  auth.jwt()->>'role' IN ('admin', 'super_admin')
);

-- Documents: Allow select by profile owner
DROP POLICY IF EXISTS "Users can view documents" ON documents;
CREATE POLICY "Users can view documents"
ON documents FOR SELECT
USING (
  auth.uid()::text = profile_id OR
  auth.jwt()->>'role' IN ('admin', 'super_admin')
);

-- Document analysis: Allow insert
DROP POLICY IF EXISTS "Users can insert document_analysis" ON document_analysis;
CREATE POLICY "Users can insert document_analysis"
ON document_analysis FOR INSERT
WITH CHECK (
  auth.uid()::text = profile_id OR
  auth.jwt()->>'role' IN ('admin', 'super_admin')
);
```

### Verify Bucket Exists
```sql
-- Check storage buckets
SELECT name, owner, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE name = 'client-documents';

-- If missing, create via Supabase Dashboard or API
```

---

## 📊 LOG INTERPRETATION GUIDE

### Success Indicators
```
✓ "STEP X PASSED" messages
✓ "Total duration: XXXms" at end
✓ "========== SUCCESS ==========" or "========== COMPLETED =========="
✓ HTTP status 200 in browser network tab
```

### Failure Indicators
```
✗ "STEP X FAILED" messages
✗ "Error type:" followed by error class
✗ "Error message:" with specific error
✗ "Total duration before failure:" (incomplete execution)
✗ HTTP status 400, 401, 404, or 500 in browser network tab
```

### Performance Indicators
```
⚡ Total duration < 500ms → Excellent
⚡ Total duration 500-2000ms → Normal
⚡ Total duration > 2000ms → Slow (check network/database)
⚡ Timeout (> 10000ms) → Function timeout (optimize or split operations)
```

---

## 🎯 EXPECTED LOG OUTPUT FOR SUCCESSFUL UPLOAD

### Frontend Console
```
[DocumentUpload] File selected: test.pdf (5.23MB)
[DocumentUpload] Validation passed
[DocumentUpload] Getting signed upload URL...
[DocumentUpload] URL received: https://...
[DocumentUpload] Starting storage upload...
[DocumentUpload] Upload progress: 0% → 10% → 45% → 90% → 100%
[DocumentUpload] Storage upload completed
[DocumentUpload] Creating metadata records...
[DocumentUpload] Metadata created: { documentId: "doc-123", analysisId: "analysis-456" }
[DocumentUpload] Upload completed successfully
```

### Backend: getSignedUploadUrl
```
[getSignedUploadUrl] ========== STEP 1: REQUEST RECEIVED ==========
[getSignedUploadUrl] STEP 2 PASSED: User authenticated
[getSignedUploadUrl] STEP 3 PASSED: Supabase configuration loaded
[getSignedUploadUrl] STEP 5 PASSED: Body parsed: { fileName: "test.pdf", fileSize: "5.23MB" }
[getSignedUploadUrl] STEP 6 PASSED: Required fields valid
[getSignedUploadUrl] STEP 7 PASSED: File size valid
[getSignedUploadUrl] STEP 8 PASSED: Profile found
[getSignedUploadUrl] STEP 9 PASSED: business_id resolved
[getSignedUploadUrl] STEP 10 PASSED: Storage path generated
[getSignedUploadUrl] STEP 11 PASSED: Signed URL generated
[getSignedUploadUrl] ========== SUCCESS ==========
Total duration: 234ms
```

### Backend: uploadDocumentDirect
```
========== uploadDocumentDirect STARTED ==========
[uploadDocumentDirect] STEP 1 PASSED: User authenticated
[uploadDocumentDirect] STEP 2 PASSED: Body parsed
[uploadDocumentDirect] STEP 3 PASSED: Required fields valid
[uploadDocumentDirect] STEP 4 PASSED: File size valid
[uploadDocumentDirect] STEP 5 PASSED: Supabase client initialized
[uploadDocumentDirect] STEP 6 PASSED: Profile found
[uploadDocumentDirect] STEP 7 PASSED: business_id resolved
[uploadDocumentDirect] STEP 8 PASSED: Document created: doc-123
[uploadDocumentDirect] STEP 9 PASSED: document_analysis created: analysis-456
========== uploadDocumentDirect COMPLETED ==========
Total duration: 456ms
```

---

## 🚨 CRITICAL ERRORS (Immediate Action Required)

### "Supabase not configured"
**Impact:** All uploads fail  
**Action:** Set environment variables immediately

### "Bucket not found"
**Impact:** All uploads fail  
**Action:** Create `client-documents` bucket in Supabase

### "Profile not found"
**Impact:** User cannot upload  
**Action:** Create profile record for user

### "violates row-level security policy"
**Impact:** All database inserts fail  
**Action:** Fix RLS policies or disable temporarily

---

## ✅ VERIFICATION STEPS AFTER FIX

1. Upload a small test file (1MB PDF)
2. Check frontend console for success message
3. Check backend logs for "SUCCESS" or "COMPLETED"
4. Verify file appears in Supabase Storage:
   ```
   Supabase Dashboard → Storage → client-documents → [profile-id]/[business-id]/[file]
   ```
5. Verify `documents` record exists:
   ```sql
   SELECT * FROM documents WHERE file_name = 'test.pdf' ORDER BY created_at DESC LIMIT 1;
   ```
6. Verify `document_analysis` record exists:
   ```sql
   SELECT * FROM document_analysis WHERE document_id = 'doc-id' ORDER BY created_at DESC LIMIT 1;
   ```
7. Check `upload_status = 'pending_analysis'`
8. Check `analysis status = 'queued'`

---

**Last Updated:** 2026-06-12  
**Maintainer:** Base44 AI Agent  
**Status:** Production Ready with Enhanced Logging